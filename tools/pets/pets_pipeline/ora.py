"""Bounded OpenRaster archive inspection for Pet source packages."""

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET
import zipfile


class OraValidationError(ValueError):
    """Raised when an ORA archive is missing or unsafe."""


@dataclass(frozen=True)
class OraStructure:
    mimetype: str
    leaf_layer_count: int
    group_count: int
    layer_png_count: int
    has_merged_image: bool
    has_thumbnail: bool


def inspect_ora(path: Path) -> OraStructure:
    try:
        if path.stat().st_size > 256 * 1024 * 1024:
            raise OraValidationError("ORA exceeds the 256 MiB validation limit")
        archive = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise OraValidationError(f"invalid ORA archive: {exc}") from exc

    with archive:
        infos = archive.infolist()
        if len(infos) > 512:
            raise OraValidationError("ORA contains too many archive members")
        if sum(info.file_size for info in infos) > 512 * 1024 * 1024:
            raise OraValidationError("ORA expands beyond the 512 MiB limit")
        names = {info.filename for info in infos}
        for name in names:
            _validate_member_name(name)

        for required in ("mimetype", "stack.xml"):
            if required not in names:
                raise OraValidationError(f"ORA is missing required {required}")
        try:
            mimetype = archive.read("mimetype").decode("ascii").strip()
        except (KeyError, UnicodeDecodeError) as exc:
            raise OraValidationError("ORA has an invalid mimetype") from exc
        if mimetype != "image/openraster":
            raise OraValidationError(f"unsupported ORA mimetype: {mimetype!r}")

        stack_info = archive.getinfo("stack.xml")
        if stack_info.file_size > 2 * 1024 * 1024:
            raise OraValidationError("ORA stack.xml exceeds the 2 MiB limit")
        try:
            root = ET.fromstring(archive.read("stack.xml"))
        except ET.ParseError as exc:
            raise OraValidationError(f"ORA stack.xml is invalid: {exc}") from exc

        layers = root.findall(".//layer")
        stacks = root.findall(".//stack")
        for layer in layers:
            source = layer.get("src")
            if not source:
                raise OraValidationError("ORA layer is missing its src attribute")
            _validate_member_name(source)
            if source not in names:
                raise OraValidationError(f"ORA layer source is missing: {source}")

        layer_png_count = sum(
            name.startswith("layers/") and name.lower().endswith(".png")
            for name in names
        )
        return OraStructure(
            mimetype=mimetype,
            leaf_layer_count=len(layers),
            group_count=max(0, len(stacks) - 1),
            layer_png_count=layer_png_count,
            has_merged_image="mergedimage.png" in names,
            has_thumbnail="Thumbnails/thumbnail.png" in names,
        )


def _validate_member_name(name: str) -> None:
    path = PurePosixPath(name.replace("\\", "/"))
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise OraValidationError(f"unsafe ORA archive member: {name!r}")
    if ":" in path.parts[0]:
        raise OraValidationError(f"unsafe ORA archive member: {name!r}")
