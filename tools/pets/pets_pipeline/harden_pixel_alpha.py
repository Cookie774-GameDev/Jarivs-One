"""Create hard-alpha logical pixel assets while isolating intentional soft effects."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .analyze_pixel_grid import _save_png_atomic
from .extract_palette import extract_palette, map_rgb_to_palette
from .normalize_package_layout import write_json_atomic
from .path_safety import resolve_under


SOFT_ALPHA_LAYER_IDS = frozenset(
    {
        "ambient_glow",
        "face_glow",
        "outline_glow",
        "rear_shadow",
    }
)


def classify_layer_alpha(manifest: dict) -> dict[str, object]:
    layers = manifest.get("layers")
    if not isinstance(layers, list):
        raise ValueError("layer manifest has no layers")
    ids = [layer.get("id") for layer in layers if isinstance(layer, dict)]
    if len(ids) != len(layers) or any(not isinstance(layer_id, str) for layer_id in ids):
        raise ValueError("layer manifest contains an invalid id")
    missing = SOFT_ALPHA_LAYER_IDS.difference(ids)
    if missing:
        raise ValueError(f"intentional soft-alpha layers are missing: {sorted(missing)}")
    soft = sorted(SOFT_ALPHA_LAYER_IDS)
    return {
        "schemaVersion": 1,
        "policy": "hard-geometry-soft-intentional-glow-shadow",
        "softAlphaLayerIds": soft,
        "softAlphaLayerCount": len(soft),
        "hardAlphaLayerCount": len(ids) - len(soft),
        "hardAlphaLayerIds": sorted(set(ids).difference(SOFT_ALPHA_LAYER_IDS)),
    }


def harden_to_native_grid(
    source: Image.Image,
    *,
    scale: int,
    palette: list[tuple[int, int, int]],
    coverage_threshold: int = 32,
) -> Image.Image:
    if scale < 1:
        raise ValueError("logical pixel scale must be positive")
    rgba = np.asarray(source.convert("RGBA"), dtype=np.uint8)
    height, width = rgba.shape[:2]
    if width % scale or height % scale:
        raise ValueError("source canvas must be divisible by logical pixel scale")
    if not 1 <= coverage_threshold <= 255:
        raise ValueError("coverage threshold must be between 1 and 255")

    logical_size = (width // scale, height // scale)
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    premultiplied = rgba[:, :, :3].astype(np.float32) * alpha[:, :, None]
    logical_alpha = cv2.resize(alpha, logical_size, interpolation=cv2.INTER_AREA)
    logical_premultiplied = cv2.resize(
        premultiplied,
        logical_size,
        interpolation=cv2.INTER_AREA,
    )
    denominator = np.maximum(logical_alpha[:, :, None], 1 / 255.0)
    logical_rgb = np.clip(np.rint(logical_premultiplied / denominator), 0, 255).astype(np.uint8)
    mapped = map_rgb_to_palette(logical_rgb, palette)
    hard_alpha = np.where(
        logical_alpha * 255.0 >= coverage_threshold,
        255,
        0,
    ).astype(np.uint8)
    mapped[hard_alpha == 0] = 0
    return Image.fromarray(np.dstack((mapped, hard_alpha)))


def downsample_soft_alpha(source: Image.Image, *, scale: int) -> Image.Image:
    if scale < 1:
        raise ValueError("logical pixel scale must be positive")
    rgba = np.asarray(source.convert("RGBA"), dtype=np.uint8)
    height, width = rgba.shape[:2]
    if width % scale or height % scale:
        raise ValueError("source canvas must be divisible by logical pixel scale")
    logical_size = (width // scale, height // scale)
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    premultiplied = rgba[:, :, :3].astype(np.float32) * alpha[:, :, None]
    logical_alpha = cv2.resize(alpha, logical_size, interpolation=cv2.INTER_AREA)
    logical_premultiplied = cv2.resize(
        premultiplied,
        logical_size,
        interpolation=cv2.INTER_AREA,
    )
    rgb = np.clip(
        np.rint(logical_premultiplied / np.maximum(logical_alpha[:, :, None], 1 / 255.0)),
        0,
        255,
    ).astype(np.uint8)
    output_alpha = np.clip(np.rint(logical_alpha * 255), 0, 255).astype(np.uint8)
    rgb[output_alpha == 0] = 0
    return Image.fromarray(np.dstack((rgb, output_alpha)))


def build_alpha_assets(
    character_root: Path,
    output_root: Path,
    *,
    scale: int,
    max_colors: int = 32,
) -> dict[str, object]:
    manifest_path = character_root / "archival" / "vibespace_axolotl_layer_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    classification = classify_layer_alpha(manifest)
    preview_path = character_root / "previews" / "vibespace_axolotl_preview_transparent.png"
    with Image.open(preview_path) as image:
        full_master = image.convert("RGBA")
        full_master.load()
    palette = extract_palette(full_master, max_colors=max_colors)
    native_master = harden_to_native_grid(full_master, scale=scale, palette=palette)

    cleaned = output_root / "cleaned"
    source_output = output_root / "source"
    effects_output = output_root / "layers" / "effects"
    previews_output = output_root / "previews"
    qa_output = output_root / "qa"
    _save_png_atomic(full_master, cleaned / "transparent-full-resolution-master.png")
    _save_png_atomic(native_master, cleaned / "canonical-native-pixel-hard-alpha.png")
    _copy_atomic(character_root / "archival" / "original-source.png", source_output / "original.png")

    by_id = {layer["id"]: layer for layer in manifest["layers"]}
    effect_names = {
        "ambient_glow": "ambient-glow.png",
        "face_glow": "face-glow.png",
        "outline_glow": "outline-glow.png",
        "rear_shadow": "rear-shadow.png",
    }
    effect_stats: dict[str, object] = {}
    for layer_id, output_name in effect_names.items():
        layer_path = resolve_under(character_root, by_id[layer_id]["file"])
        with Image.open(layer_path) as image:
            effect = downsample_soft_alpha(image, scale=scale)
            effect.load()
        _save_png_atomic(effect, effects_output / output_name)
        alpha = np.asarray(effect)[:, :, 3]
        effect_stats[layer_id] = {
            "partialAlphaPixels": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
            "opaquePixels": int(np.count_nonzero(alpha == 255)),
        }

    palette_document = {
        "schemaVersion": 1,
        "characterId": "vibespace-axolotl-pixel",
        "source": "cleaned/transparent-full-resolution-master.png",
        "maxColors": max_colors,
        "colors": [
            {"hex": f"#{red:02X}{green:02X}{blue:02X}", "rgb": [red, green, blue]}
            for red, green, blue in palette
        ],
        "effectPaletteExceptions": sorted(SOFT_ALPHA_LAYER_IDS),
    }
    write_json_atomic(source_output / "palette.json", palette_document)
    write_json_atomic(cleaned / "alpha-classification.json", classification)

    source_alpha = np.asarray(full_master)[:, :, 3]
    native_array = np.asarray(native_master)
    native_alpha = native_array[:, :, 3]
    validation = {
        "schemaVersion": 1,
        "status": "pass",
        "logicalPixelScale": scale,
        "sourceCanvas": list(full_master.size),
        "nativeCanvas": list(native_master.size),
        "sourcePartialAlphaPixels": int(
            np.count_nonzero((source_alpha > 0) & (source_alpha < 255))
        ),
        "nativePartialAlphaPixels": int(
            np.count_nonzero((native_alpha > 0) & (native_alpha < 255))
        ),
        "nativeTransparentRgbZero": bool(
            np.all(native_array[native_alpha == 0, :3] == 0)
        ),
        "nativePaletteColorCount": len(
            set(map(tuple, native_array[native_alpha == 255, :3]))
        ),
        "canonicalPaletteColorCount": len(palette),
        "softEffects": effect_stats,
    }
    write_json_atomic(qa_output / "alpha-validation.json", validation)
    _render_alpha_comparison(native_master, previews_output / "alpha-light-dark-comparison.png")
    (cleaned / "edge-hardening-report.md").parent.mkdir(parents=True, exist_ok=True)
    _write_text_atomic(
        cleaned / "edge-hardening-report.md",
        _edge_report_markdown(validation, classification),
    )
    return validation


def _render_alpha_comparison(native_master: Image.Image, output_path: Path) -> None:
    panel = 512
    sheet = Image.new("RGBA", (panel * 2, panel), (0, 0, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, background in enumerate(((246, 239, 229, 255), (24, 22, 27, 255))):
        canvas = Image.new("RGBA", (panel, panel), background)
        sprite = native_master.resize(
            (native_master.width * 2, native_master.height * 2),
            Image.Resampling.NEAREST,
        )
        canvas.alpha_composite(sprite, ((panel - sprite.width) // 2, (panel - sprite.height) // 2))
        sheet.alpha_composite(canvas, (index * panel, 0))
        draw.text(
            (index * panel + 12, 10),
            "hard alpha on light" if index == 0 else "hard alpha on dark",
            fill=(58, 37, 32, 255) if index == 0 else (255, 238, 222, 255),
        )
    _save_png_atomic(sheet, output_path)


def _edge_report_markdown(validation: dict[str, object], classification: dict[str, object]) -> str:
    return (
        "# Pixel edge hardening report\n\n"
        f"- Logical pixel scale: {validation['logicalPixelScale']}×\n"
        f"- Native canvas: {validation['nativeCanvas'][0]} × {validation['nativeCanvas'][1]}\n"
        f"- Source partial-alpha pixels: {validation['sourcePartialAlphaPixels']:,}\n"
        f"- Native geometry partial-alpha pixels: {validation['nativePartialAlphaPixels']}\n"
        f"- Canonical palette colors: {validation['canonicalPaletteColorCount']}\n"
        f"- Transparent native pixels have zero RGB: {validation['nativeTransparentRgbZero']}\n"
        "- Geometry policy: palette-preserving area reconstruction, nearest logical pixels, binary 0/255 alpha.\n"
        "- Soft-alpha exceptions: "
        + ", ".join(classification["softAlphaLayerIds"])
        + ".\n"
    )


def _copy_atomic(source: Path, output: Path) -> None:
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.", suffix=".tmp", dir=output.parent, delete=False
    )
    temp = Path(handle.name)
    handle.close()
    try:
        shutil.copyfile(source, temp)
        with temp.open("r+b") as stream:
            os.fsync(stream.fileno())
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)


def _write_text_atomic(output: Path, content: str) -> None:
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    )
    temp = Path(handle.name)
    try:
        with handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--scale", type=int, required=True)
    parser.add_argument("--max-colors", type=int, default=32)
    args = parser.parse_args(argv)
    validation = build_alpha_assets(
        args.character_root,
        args.output_root,
        scale=args.scale,
        max_colors=args.max_colors,
    )
    print(
        f"nativeCanvas={validation['nativeCanvas']} "
        f"partialAlpha={validation['nativePartialAlphaPixels']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
