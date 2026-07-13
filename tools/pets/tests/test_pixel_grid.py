from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.analyze_pixel_grid import (
    analyze_pixel_grid,
    render_pixel_grid_candidates,
)


SOURCE_PREVIEW = (
    REPO_ROOT
    / "grok"
    / "pets"
    / "input"
    / "characters"
    / "vibespace-axolotl-pixel"
    / "previews"
    / "vibespace_axolotl_preview_transparent.png"
)


def test_analyze_pixel_grid_recovers_synthetic_six_pixel_scale() -> None:
    logical = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(logical)
    draw.polygon(
        [(5, 8), (8, 8), (8, 5), (12, 5), (12, 3), (18, 3), (18, 6),
         (23, 6), (23, 10), (27, 10), (27, 23), (22, 23), (22, 27),
         (10, 27), (10, 24), (5, 24)],
        fill=(255, 170, 130, 255),
    )
    for x in range(10, 22):
        draw.point((x, 14), fill=((255, 230, 190, 255) if x % 2 else (120, 45, 35, 255)))
    source = logical.resize((192, 192), Image.Resampling.NEAREST)

    report = analyze_pixel_grid(np.asarray(source), candidate_scales=range(2, 13))

    assert report["selectedScale"] == 6
    assert report["logicalCanvas"] == [32, 32]
    assert report["confidence"] >= 0.2


def test_analyze_real_axolotl_selects_six_pixel_native_grid() -> None:
    source = np.asarray(Image.open(SOURCE_PREVIEW).convert("RGBA"))

    report = analyze_pixel_grid(source, candidate_scales=range(2, 13))

    assert report["sourceCanvas"] == [1254, 1254]
    assert report["selectedScale"] == 6
    assert report["logicalCanvas"] == [209, 209]
    assert report["selectionBasis"] == "quantitative-and-visual-candidate"
    assert report["candidates"][0]["scale"] == 6


def test_render_pixel_grid_candidates_is_nearest_neighbor_and_bounded(
    tmp_path: Path,
) -> None:
    source = Image.open(SOURCE_PREVIEW).convert("RGBA")
    report = analyze_pixel_grid(np.asarray(source), candidate_scales=range(2, 13))
    output = tmp_path / "candidates.png"

    render_pixel_grid_candidates(source, report, output)

    with Image.open(output) as sheet:
        assert sheet.mode == "RGBA"
        assert sheet.width <= 2048
        assert sheet.height <= 2048
        assert sheet.info.get("interpolation") is None
