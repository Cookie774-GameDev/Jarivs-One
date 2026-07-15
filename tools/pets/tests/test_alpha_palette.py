import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.extract_palette import extract_palette, map_rgb_to_palette
from pets_pipeline.harden_pixel_alpha import (
    classify_layer_alpha,
    downsample_soft_alpha,
    harden_to_native_grid,
)


CHARACTER_ROOT = (
    REPO_ROOT
    / "grok"
    / "pets"
    / "input"
    / "characters"
    / "vibespace-axolotl-pixel"
)
MANIFEST = json.loads(
    (CHARACTER_ROOT / "archival" / "vibespace_axolotl_layer_manifest.json").read_text(
        encoding="utf-8"
    )
)
SOURCE_PREVIEW = CHARACTER_ROOT / "previews" / "vibespace_axolotl_preview_transparent.png"


def test_alpha_classification_preserves_only_intentional_glow_and_shadow() -> None:
    classification = classify_layer_alpha(MANIFEST)

    assert classification["softAlphaLayerIds"] == [
        "ambient_glow",
        "face_glow",
        "outline_glow",
        "rear_shadow",
    ]
    assert classification["hardAlphaLayerCount"] == 132
    assert classification["softAlphaLayerCount"] == 4
    assert classification["policy"] == "hard-geometry-soft-intentional-glow-shadow"


def test_extract_palette_is_deterministic_bounded_and_ignores_transparent_rgb() -> None:
    source = Image.new("RGBA", (8, 2), (255, 0, 255, 0))
    pixels = source.load()
    for x in range(8):
        pixels[x, 0] = ((x * 31) % 256, (x * 47) % 256, (x * 61) % 256, 255)

    first = extract_palette(source, max_colors=4)
    second = extract_palette(source, max_colors=4)

    assert first == second
    assert 1 <= len(first) <= 4
    assert (255, 0, 255) not in first


def test_harden_to_native_grid_produces_palette_only_binary_alpha() -> None:
    array = np.zeros((12, 12, 4), dtype=np.uint8)
    array[2:10, 2:10, :3] = (250, 170, 130)
    array[2:10, 2:10, 3] = 180
    source = Image.fromarray(array)
    palette = [(255, 168, 128), (80, 35, 30)]

    result = harden_to_native_grid(source, scale=2, palette=palette)

    output = np.asarray(result)
    assert result.size == (6, 6)
    assert set(np.unique(output[:, :, 3])) <= {0, 255}
    assert np.all(output[output[:, :, 3] == 0, :3] == 0)
    assert set(map(tuple, output[output[:, :, 3] == 255, :3])) <= set(palette)


def test_real_hard_alpha_master_is_209_square_and_palette_bounded() -> None:
    source = Image.open(SOURCE_PREVIEW).convert("RGBA")
    palette = extract_palette(source, max_colors=32)

    result = harden_to_native_grid(source, scale=6, palette=palette)

    output = np.asarray(result)
    assert result.size == (209, 209)
    assert set(np.unique(output[:, :, 3])) == {0, 255}
    assert set(map(tuple, output[output[:, :, 3] == 255, :3])) <= set(palette)
    remapped = map_rgb_to_palette(output[:, :, :3], palette)
    assert np.array_equal(remapped[output[:, :, 3] == 255], output[output[:, :, 3] == 255, :3])


def test_downsample_soft_alpha_retains_intentional_partial_coverage() -> None:
    array = np.zeros((12, 12, 4), dtype=np.uint8)
    array[2:10, 2:10, :3] = (255, 170, 130)
    array[2:10, 2:10, 3] = 96

    result = downsample_soft_alpha(Image.fromarray(array), scale=2)

    alpha = np.asarray(result)[:, :, 3]
    assert result.size == (6, 6)
    assert np.any((alpha > 0) & (alpha < 255))
    assert np.all(np.asarray(result)[alpha == 0, :3] == 0)
