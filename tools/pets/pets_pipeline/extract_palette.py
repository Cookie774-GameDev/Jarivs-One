"""Deterministic bounded palette extraction and nearest-color mapping."""

from __future__ import annotations

import numpy as np
from PIL import Image


def extract_palette(image: Image.Image, *, max_colors: int = 32) -> list[tuple[int, int, int]]:
    if not 1 <= max_colors <= 256:
        raise ValueError("max_colors must be between 1 and 256")
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    opaque_rgb = rgba[rgba[:, :, 3] > 0, :3]
    if opaque_rgb.size == 0:
        raise ValueError("cannot extract a palette from a transparent image")
    unique = np.unique(opaque_rgb, axis=0)
    color_count = min(max_colors, len(unique))
    if len(unique) <= max_colors:
        colors, counts = np.unique(opaque_rgb, axis=0, return_counts=True)
        ordered = sorted(
            zip(counts.tolist(), map(tuple, colors.tolist())),
            key=lambda item: (-item[0], item[1]),
        )
        return [color for _, color in ordered]

    strip = Image.fromarray(opaque_rgb.reshape(1, -1, 3))
    quantized = strip.quantize(
        colors=color_count,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    palette_values = quantized.getpalette() or []
    counts = quantized.getcolors(maxcolors=opaque_rgb.shape[0]) or []
    result: list[tuple[int, int, int]] = []
    for _, index in sorted(counts, key=lambda item: (-item[0], item[1])):
        start = index * 3
        result.append(tuple(palette_values[start : start + 3]))
    return result


def map_rgb_to_palette(
    rgb: np.ndarray,
    palette: list[tuple[int, int, int]],
) -> np.ndarray:
    source = np.asarray(rgb, dtype=np.uint8)
    if source.ndim != 3 or source.shape[2] != 3:
        raise ValueError("palette mapping input must be an RGB image")
    if not palette:
        raise ValueError("palette mapping requires at least one color")
    palette_array = np.asarray(palette, dtype=np.int32)
    flat = source.reshape(-1, 3)
    output = np.empty_like(flat)
    for start in range(0, len(flat), 65_536):
        chunk = flat[start : start + 65_536].astype(np.int32)
        distances = np.sum((chunk[:, None, :] - palette_array[None, :, :]) ** 2, axis=2)
        output[start : start + len(chunk)] = palette_array[np.argmin(distances, axis=1)]
    return output.reshape(source.shape)
