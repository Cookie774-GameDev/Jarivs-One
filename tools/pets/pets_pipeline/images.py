"""Bounded PNG inspection and deterministic layer compositing."""

from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .models import AlphaStats, PngInfo


class ImageValidationError(ValueError):
    """Raised when a source image violates package limits."""


def inspect_png(path: Path, *, max_pixels: int = 20_000_000) -> PngInfo:
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ImageValidationError(f"expected PNG image: {path.name}")
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > max_pixels:
                raise ImageValidationError(
                    f"image exceeds pixel limit ({max_pixels}): {path.name}"
                )
            rgba = image.convert("RGBA")
            rgba.load()
    except (OSError, UnidentifiedImageError) as exc:
        raise ImageValidationError(f"unable to decode PNG {path.name}: {exc}") from exc

    alpha = rgba.getchannel("A")
    histogram = alpha.histogram()
    transparent = histogram[0]
    opaque = histogram[255]
    partial = sum(histogram[1:255])
    nonzero = [index for index, count in enumerate(histogram) if count]
    stats = AlphaStats(
        minimum=nonzero[0],
        maximum=nonzero[-1],
        transparent=transparent,
        opaque=opaque,
        partial=partial,
    )
    return PngInfo(
        width=width,
        height=height,
        mode="RGBA",
        nontransparent_pixels=opaque + partial,
        alpha=stats,
    )
