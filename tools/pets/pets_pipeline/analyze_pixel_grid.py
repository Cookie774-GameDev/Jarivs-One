"""Quantitative native-grid analysis for layered pixel characters."""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path
import tempfile
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .normalize_package_layout import write_json_atomic


def analyze_pixel_grid(
    rgba: np.ndarray,
    *,
    candidate_scales: Iterable[int] = range(2, 13),
) -> dict[str, object]:
    source = np.asarray(rgba)
    if source.ndim != 3 or source.shape[2] != 4 or source.dtype != np.uint8:
        raise ValueError("pixel-grid input must be an 8-bit RGBA image")
    height, width = source.shape[:2]
    if width <= 0 or height <= 0 or width * height > 20_000_000:
        raise ValueError("pixel-grid input exceeds image limits")
    scales = sorted({int(scale) for scale in candidate_scales if 2 <= int(scale) <= 64})
    if not scales:
        raise ValueError("pixel-grid analysis requires at least one candidate scale")

    hard_alpha = (source[:, :, 3] >= 192).astype(np.uint8)
    if not np.any(hard_alpha):
        raise ValueError("pixel-grid input has no solid foreground")
    direction_runs = _contour_direction_runs(hard_alpha)
    bounded_runs = np.asarray(
        [run for run in direction_runs if 4 <= run <= max(scales) * 4],
        dtype=np.int32,
    )
    if bounded_runs.size < 8:
        raise ValueError("pixel-grid input has insufficient contour evidence")
    edge = cv2.Canny(hard_alpha * 255, 0, 1).astype(np.uint8)

    candidates: list[dict[str, object]] = []
    for scale in scales:
        run_band = float(np.mean(np.abs(bounded_runs - scale) <= 1))
        remainder = bounded_runs % scale
        distance = np.minimum(remainder, scale - remainder)
        transition_support = float(np.mean(distance <= 1))
        block_iou = _block_reconstruction_iou(hard_alpha, scale)
        color_block_agreement = _color_block_agreement(source, scale)
        edge_autocorrelation = _edge_autocorrelation(edge, scale)
        dimension_fit = float(width % scale == 0 and height % scale == 0)
        candidates.append(
            {
                "scale": scale,
                "runLengthSupport": run_band,
                "transitionSpacingSupport": transition_support,
                "blockConsistencyIou": block_iou,
                "colorBlockAgreement": color_block_agreement,
                "edgeAutocorrelation": edge_autocorrelation,
                "dimensionFit": bool(dimension_fit),
                "compressionPreference": math.log(scale) / math.log(max(scales)),
            }
        )

    for metric in (
        "runLengthSupport",
        "transitionSpacingSupport",
        "blockConsistencyIou",
        "colorBlockAgreement",
    ):
        _add_normalized_metric(candidates, metric)
    exact_cell_candidates = [
        int(candidate["scale"])
        for candidate in candidates
        if float(candidate["colorBlockAgreement"]) >= 0.995
        and float(candidate["transitionSpacingSupport"]) >= 0.95
        and bool(candidate["dimensionFit"])
    ]
    largest_exact_cell = max(exact_cell_candidates, default=0)
    for candidate in candidates:
        exact_cell_bonus = (
            int(candidate["scale"]) / largest_exact_cell
            if int(candidate["scale"]) in exact_cell_candidates
            else 0.0
        )
        candidate["exactRepeatingCellBonus"] = exact_cell_bonus
        candidate["score"] = (
            0.40 * float(candidate["runLengthSupportNormalized"])
            + 0.22 * float(candidate["transitionSpacingSupportNormalized"])
            + 0.08 * float(candidate["blockConsistencyIouNormalized"])
            + 0.10 * float(candidate["colorBlockAgreementNormalized"])
            + 0.15 * float(candidate["dimensionFit"])
            + 0.05 * float(candidate["compressionPreference"])
            + 0.40 * exact_cell_bonus
        )
    candidates.sort(key=lambda item: (-float(item["score"]), int(item["scale"])))
    selected = int(candidates[0]["scale"])
    confidence = max(0.0, min(1.0, float(candidates[0]["score"]) - float(candidates[1]["score"])))
    return {
        "schemaVersion": 1,
        "sourceCanvas": [width, height],
        "selectedScale": selected,
        "logicalCanvas": [round(width / selected), round(height / selected)],
        "gridOffset": list(_best_alpha_grid_offset(hard_alpha, selected)),
        "confidence": confidence,
        "selectionBasis": "quantitative-and-visual-candidate",
        "alphaThreshold": 192,
        "contourRunCount": int(len(direction_runs)),
        "boundedContourRunCount": int(bounded_runs.size),
        "candidates": candidates,
    }


def render_pixel_grid_candidates(
    source: Image.Image,
    report: dict[str, object],
    output_path: Path,
) -> None:
    rgba = source.convert("RGBA")
    candidates = list(report.get("candidates", []))[:3]
    if not candidates:
        raise ValueError("pixel-grid report contains no candidates")
    panel_size = 512
    label_height = 32
    sheet = Image.new("RGBA", (panel_size * len(candidates), panel_size), (25, 25, 28, 255))
    draw = ImageDraw.Draw(sheet)
    for index, candidate in enumerate(candidates):
        scale = int(candidate["scale"])
        reconstructed = _reconstruct_candidate(rgba, scale)
        reconstructed.thumbnail(
            (panel_size - 24, panel_size - label_height - 24),
            Image.Resampling.NEAREST,
        )
        x = index * panel_size + (panel_size - reconstructed.width) // 2
        y = label_height + (panel_size - label_height - reconstructed.height) // 2
        sheet.alpha_composite(reconstructed, (x, y))
        draw.text(
            (index * panel_size + 12, 10),
            f"{scale}x logical candidate | score {float(candidate['score']):.3f}",
            fill=(255, 238, 222, 255),
        )
    _save_png_atomic(sheet, output_path)


def _contour_direction_runs(mask: np.ndarray) -> list[int]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    runs: list[int] = []
    for contour in contours:
        if len(contour) < 20:
            continue
        points = contour[:, 0, :]
        deltas = np.diff(np.vstack((points, points[:1])), axis=0)
        previous = deltas[0]
        length = 1
        for delta in deltas[1:]:
            if np.array_equal(delta, previous):
                length += 1
            else:
                runs.append(length)
                previous = delta
                length = 1
        runs.append(length)
    return runs


def _block_reconstruction_iou(mask: np.ndarray, scale: int) -> float:
    height = mask.shape[0] // scale * scale
    width = mask.shape[1] // scale * scale
    cropped = mask[:height, :width]
    logical = cv2.resize(
        cropped,
        (width // scale, height // scale),
        interpolation=cv2.INTER_AREA,
    ) >= 0.5
    reconstructed = cv2.resize(
        logical.astype(np.uint8),
        (width, height),
        interpolation=cv2.INTER_NEAREST,
    ).astype(bool)
    solid = cropped.astype(bool)
    union = int(np.count_nonzero(reconstructed | solid))
    return float(np.count_nonzero(reconstructed & solid) / max(1, union))


def _edge_autocorrelation(edge: np.ndarray, scale: int) -> float:
    edge_count = max(1, int(np.count_nonzero(edge)))
    horizontal = np.count_nonzero(edge[:, scale:] & edge[:, :-scale]) / edge_count
    vertical = np.count_nonzero(edge[scale:, :] & edge[:-scale, :]) / edge_count
    return float((horizontal + vertical) / 2)


def _color_block_agreement(source: np.ndarray, scale: int) -> float:
    height = source.shape[0] // scale * scale
    width = source.shape[1] // scale * scale
    quantized = (source[:height, :width] // 16).reshape(
        height // scale,
        scale,
        width // scale,
        scale,
        4,
    )
    anchor = quantized[:, 0, :, 0, :]
    agreement = np.all(quantized == anchor[:, None, :, None, :], axis=4)
    touched = np.any(quantized[:, :, :, :, 3] > 0, axis=(1, 3))
    touched_pixels = np.broadcast_to(touched[:, None, :, None], agreement.shape)
    return float(np.mean(agreement[touched_pixels]))


def _add_normalized_metric(candidates: list[dict[str, object]], metric: str) -> None:
    values = [float(candidate[metric]) for candidate in candidates]
    low = min(values)
    span = max(values) - low
    for candidate in candidates:
        candidate[f"{metric}Normalized"] = (
            (float(candidate[metric]) - low) / span if span > 0 else 1.0
        )


def _best_alpha_grid_offset(mask: np.ndarray, scale: int) -> tuple[int, int]:
    best_score = -1.0
    best = (0, 0)
    for offset_y in range(scale):
        for offset_x in range(scale):
            height = (mask.shape[0] - offset_y) // scale * scale
            width = (mask.shape[1] - offset_x) // scale * scale
            blocks = mask[offset_y : offset_y + height, offset_x : offset_x + width].reshape(
                height // scale,
                scale,
                width // scale,
                scale,
            )
            solid = np.all(blocks, axis=(1, 3))
            empty = np.all(blocks == 0, axis=(1, 3))
            touched = np.any(blocks, axis=(1, 3))
            score = float(np.mean((solid | empty)[touched]))
            if score > best_score:
                best_score = score
                best = (offset_x, offset_y)
    return best


def _reconstruct_candidate(source: Image.Image, scale: int) -> Image.Image:
    width = source.width // scale * scale
    height = source.height // scale * scale
    array = np.asarray(source.crop((0, 0, width, height)), dtype=np.uint8)
    logical = cv2.resize(
        array,
        (width // scale, height // scale),
        interpolation=cv2.INTER_AREA,
    )
    logical[:, :, 3] = np.where(logical[:, :, 3] >= 128, 255, 0).astype(np.uint8)
    reconstructed = cv2.resize(logical, (width, height), interpolation=cv2.INTER_NEAREST)
    return Image.fromarray(reconstructed)


def _save_png_atomic(image: Image.Image, output_path: Path) -> None:
    output = output_path.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    )
    temp = Path(handle.name)
    handle.close()
    try:
        image.save(temp, format="PNG", optimize=False, compress_level=9)
        with temp.open("r+b") as stream:
            os.fsync(stream.fileno())
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    args = parser.parse_args(argv)
    with Image.open(args.source) as image:
        source = image.convert("RGBA")
        source.load()
    report = analyze_pixel_grid(np.asarray(source), candidate_scales=range(2, 13))
    write_json_atomic(args.report, report)
    render_pixel_grid_candidates(source, report, args.candidates)
    print(
        f"selectedScale={report['selectedScale']} "
        f"confidence={float(report['confidence']):.6f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
