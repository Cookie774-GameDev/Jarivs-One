"""Bounded PSD structure inspection for immutable Pet source packages."""

from dataclasses import dataclass
from pathlib import Path
import struct


class PsdValidationError(ValueError):
    """Raised when a PSD does not satisfy the supported structure."""


@dataclass(frozen=True)
class PsdStructure:
    signature: str
    version: int
    width: int
    height: int
    layer_record_count: int
    section_divider_count: int
    leaf_layer_count: int
    group_count: int
    contains_transparency_layers: bool


def inspect_psd(path: Path) -> PsdStructure:
    try:
        data = path.read_bytes()
    except OSError as exc:
        raise PsdValidationError(f"unable to read PSD: {exc}") from exc
    if len(data) < 4 or data[:4] != b"8BPS":
        raise PsdValidationError("invalid PSD signature; expected 8BPS")
    if len(data) > 256 * 1024 * 1024:
        raise PsdValidationError("PSD exceeds the 256 MiB validation limit")

    reader = _Reader(data)
    try:
        signature = reader.read(4).decode("ascii")
        version = reader.u16()
        if version != 1:
            raise PsdValidationError(f"unsupported PSD version: {version}")
        reader.skip(6)
        reader.u16()  # channel count
        height = reader.u32()
        width = reader.u32()
        reader.u16()  # depth
        reader.u16()  # color mode

        reader.skip(reader.u32())  # color-mode data
        reader.skip(reader.u32())  # image resources
        layer_mask_length = reader.u32()
        layer_mask_end = reader.position + layer_mask_length
        if layer_mask_end > len(data):
            raise PsdValidationError("truncated PSD layer-and-mask section")
        if layer_mask_length < 6:
            raise PsdValidationError("truncated PSD layer information")

        layer_info_length = reader.u32()
        layer_info_end = reader.position + layer_info_length
        if layer_info_end > layer_mask_end:
            raise PsdValidationError("truncated PSD layer information")
        raw_layer_count = reader.i16()
        layer_record_count = abs(raw_layer_count)
        section_divider_count = 0
        contains_transparency = raw_layer_count < 0

        for _ in range(layer_record_count):
            reader.skip(16)  # top, left, bottom, right
            channel_count = reader.u16()
            if channel_count > 64:
                raise PsdValidationError("PSD layer declares too many channels")
            for _ in range(channel_count):
                channel_id = reader.i16()
                reader.u32()  # channel payload length
                contains_transparency = contains_transparency or channel_id < 0
            if reader.read(4) != b"8BIM":
                raise PsdValidationError("invalid PSD layer blend signature")
            reader.skip(4)  # blend key
            reader.skip(4)  # opacity, clipping, flags, filler
            extra_length = reader.u32()
            extra_end = reader.position + extra_length
            if extra_end > layer_info_end:
                raise PsdValidationError("truncated PSD layer extra data")

            reader.skip(reader.u32())  # layer mask data
            reader.skip(reader.u32())  # blending ranges
            name_length = reader.u8()
            reader.skip(name_length)
            reader.skip((4 - ((name_length + 1) % 4)) % 4)

            while reader.position + 12 <= extra_end:
                signature_bytes = reader.read(4)
                if signature_bytes not in {b"8BIM", b"8B64"}:
                    raise PsdValidationError("invalid PSD additional-info signature")
                key = reader.read(4)
                block_length = reader.u32()
                if key in {b"lsct", b"lsdk"}:
                    section_divider_count += 1
                reader.skip(block_length)
                if block_length % 2:
                    reader.skip(1)
            reader.position = extra_end

        if reader.position > layer_info_end:
            raise PsdValidationError("truncated PSD layer records")
    except (IndexError, UnicodeDecodeError, struct.error) as exc:
        raise PsdValidationError("truncated PSD structure") from exc

    leaf_layer_count = layer_record_count - section_divider_count
    if leaf_layer_count < 0 or section_divider_count % 2:
        raise PsdValidationError("invalid PSD group/layer record structure")
    return PsdStructure(
        signature=signature,
        version=version,
        width=width,
        height=height,
        layer_record_count=layer_record_count,
        section_divider_count=section_divider_count,
        leaf_layer_count=leaf_layer_count,
        group_count=section_divider_count // 2,
        contains_transparency_layers=contains_transparency,
    )


class _Reader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.position = 0

    def read(self, size: int) -> bytes:
        if size < 0 or self.position + size > len(self.data):
            raise IndexError("truncated read")
        value = self.data[self.position : self.position + size]
        self.position += size
        return value

    def skip(self, size: int) -> None:
        self.read(size)

    def u8(self) -> int:
        return self.read(1)[0]

    def u16(self) -> int:
        return struct.unpack(">H", self.read(2))[0]

    def i16(self) -> int:
        return struct.unpack(">h", self.read(2))[0]

    def u32(self) -> int:
        return struct.unpack(">I", self.read(4))[0]
