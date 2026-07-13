#!/usr/bin/env python3
"""Rebuild the normal cream Axo atlases from the authoritative motion videos.

The layered package remains the immutable identity reference, but animation
pixels come from the supplied cream-Axo videos.  The previous implementation
stamped one static layered master into every frame and transferred only whole-
sprite x/y/scale; that erased articulated motion while producing different
enough cells to fool a simple hash test.

This generator:
  * verifies every source-video SHA-256 before decoding;
  * removes only the green screen (never black visor/eye pixels);
  * keeps the main connected character and rejects detached background sparks;
  * uses one stable crop per source video and NEAREST resampling;
  * writes hard-alpha 128px and 256px sheets into the existing atlas layout;
  * preserves frame names, counts, JSON, timing, V-logo orientation, and Glitch;
  * regenerates bounded Axo-only contact sheets for visual QA.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
VIDEO_DIR = Path(
    r"C:\Users\viper\Downloads\VibeSpaceOs"
    r"\vibespace_axolotl_layered_package\vIDEOS!"
)
AXO = ROOT / "app/src/assets/pets/characters/vibespace-axolotl"
GLITCH = ROOT / "app/src/assets/pets/characters/vibespace-axolotl-glitch"
DOCS_CONTACTS = ROOT / "docs/pets/contact-sheets"
EVIDENCE = ROOT / "docs/pets/evidence"
CELL = 128

EXPECTED_VIDEO_SHA256 = {
    "welcome": "dc1f98a389daf3dcab30ba7f8ad7c8c1ddeebe8f2777714caa34d5945a6fc880",
    "idlePrimary": "5e600d6bb6b2121544a446244a3bbd9d8c4f4978db637d704d2e6a3de501bf0e",
    "idleFun": "030f34a509802a05aa7e98d58d1f07fdcfc1df7944e88a1aef73b63509d9654e",
    "walkLeft": "ba04c0c8d6113b16e1b3069c2b3590d5204fa60328308ca6ddf44bf39e498237",
    "walkRight": "00275dce13f91a8ea097e6ef45c3951f328314c842eda198db6646aa1ef4be9e",
    "sleep": "53c199588336d011ee97a7f7618a7416fbe4dfd5827624a09fe4d26fc51dd5f3",
}


@dataclass(frozen=True)
class AnimationSpec:
    name: str
    video_key: str
    pattern: str
    frame_count: int
    start_fraction: float = 0.0
    end_fraction: float = 1.0
    reverse: bool = False
    loop: bool = False


SPECS = (
    AnimationSpec(
        "welcome",
        "welcome",
        "Axolotl_character_pixel_art_Welcome Animtion",
        60,
    ),
    AnimationSpec(
        "idlePrimary",
        "idlePrimary",
        "Axolotl_character_breathing_and",
        48,
        loop=True,
    ),
    AnimationSpec(
        "idleFun",
        "idleFun",
        "Axolotl_character_2nd idle_animation",
        60,
    ),
    AnimationSpec(
        "walkLeft",
        "walkLeft",
        "Axolotl_walking_cycle_left",
        20,
        loop=True,
    ),
    AnimationSpec(
        "walkRight",
        "walkRight",
        "Axolotl_walking_in_place_animation",
        20,
        loop=True,
    ),
    # The source settles into the seated sleep pose at ~7.5s of its 10s.
    AnimationSpec(
        "sleepTransition",
        "sleep",
        "Axolotl_transitions_to_sleep",
        120,
        start_fraction=0.0,
        end_fraction=0.75,
    ),
    AnimationSpec(
        "sleepingLoop",
        "sleep",
        "Axolotl_transitions_to_sleep",
        40,
        # Verified stable/cyclic tail: source frames 185..238 (7.708..9.917s).
        # Frames 179..184 are seated but still settling and create a seam spike.
        start_fraction=185 / 239,
        end_fraction=1.0,
        loop=True,
    ),
    # No separate wake clip was supplied: reverse-sample the complete transition
    # so the first interaction visibly returns from seated sleep to happy idle.
    AnimationSpec(
        "wakeFromSleep",
        "sleep",
        "Axolotl_transitions_to_sleep",
        8,
        start_fraction=0.0,
        end_fraction=0.75,
        reverse=True,
    ),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_tree(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256_file(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def find_video(spec: AnimationSpec) -> Path:
    matches = sorted(
        path for path in VIDEO_DIR.glob("*.mp4") if spec.pattern.casefold() in path.name.casefold()
    )
    if len(matches) != 1:
        raise RuntimeError(
            f"{spec.name}: expected one video containing {spec.pattern!r}, found {len(matches)}"
        )
    video = matches[0]
    actual = sha256_file(video)
    expected = EXPECTED_VIDEO_SHA256[spec.video_key]
    if actual != expected:
        raise RuntimeError(
            f"{spec.name}: source checksum mismatch for {video.name}: {actual} != {expected}"
        )
    return video


def open_capture(video: Path) -> cv2.VideoCapture:
    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError(f"could not decode {video}")
    return capture


def clean_foreground(rgb: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Hard-key green and retain the connected Axo, never generic black/white."""
    red = rgb[..., 0].astype(np.int16)
    green = rgb[..., 1].astype(np.int16)
    blue = rgb[..., 2].astype(np.int16)
    keyed_green = (
        (green > 58)
        & (green > red * 1.10)
        & (green > blue * 1.10)
        & ((green - red) > 18)
        & ((green - blue) > 12)
    )
    # Welcome begins on neutral checkerboard with black side bars. Remove only
    # neutral pixels connected to the video border; identical dark visor/eye
    # pixels inside the Axo are not connected to that background component.
    high = np.maximum(np.maximum(red, green), blue)
    low = np.minimum(np.minimum(red, green), blue)
    neutral_border_candidate = ((high - low) <= 12) & ((high >= 185) | (high <= 28))
    border_count, border_labels = cv2.connectedComponents(
        neutral_border_candidate.astype(np.uint8),
        connectivity=8,
    )
    border_ids = set(int(value) for value in border_labels[0, :])
    border_ids.update(int(value) for value in border_labels[-1, :])
    border_ids.update(int(value) for value in border_labels[:, 0])
    border_ids.update(int(value) for value in border_labels[:, -1])
    border_ids.discard(0)
    keyed_neutral_border = (
        np.isin(border_labels, list(border_ids))
        if border_count > 1 and border_ids
        else np.zeros_like(keyed_green)
    )
    foreground = (~(keyed_green | keyed_neutral_border)).astype(np.uint8)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(foreground, connectivity=8)
    if count <= 1:
        raise RuntimeError("green-screen key produced no foreground")

    height, width = foreground.shape
    candidates: list[int] = []
    for label in range(1, count):
        x, y, w, h, area = (int(value) for value in stats[label])
        covers_background = (
            area >= width * height * 0.45
            or (w >= width * 0.90 and h >= height * 0.90)
        )
        # Welcome's jump reaches the top edge. Border contact alone is not
        # background evidence after green and neutral-border components are keyed.
        if not covers_background and area >= 64:
            candidates.append(label)
    if not candidates:
        raise RuntimeError("no bounded character component after green-screen key")
    main = max(candidates, key=lambda label: int(stats[label, cv2.CC_STAT_AREA]))
    mx, my, mw, mh, main_area = (int(value) for value in stats[main])

    keep = labels == main
    # Preserve meaningful enclosed details that compression may separate from
    # the main silhouette, but reject remote sparkles and the detached floor shadow.
    for label in candidates:
        if label == main:
            continue
        x, y, w, h, area = (int(value) for value in stats[label])
        center_x = x + w / 2
        center_y = y + h / 2
        enclosed = mx - 4 <= center_x <= mx + mw + 4 and my - 4 <= center_y <= my + mh + 4
        if enclosed and area >= max(12, int(main_area * 0.00015)):
            keep |= labels == label

    ys, xs = np.where(keep)
    if len(xs) < 128:
        raise RuntimeError("character foreground is unexpectedly small")
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(keep, 255, 0).astype(np.uint8)
    # Remove residual green spill from hard foreground edge pixels without
    # changing the approved cream/pink/orange palette.
    spill = keep & (green > np.maximum(red, blue) + 8)
    rgba[..., 1][spill] = np.maximum(red[spill], blue[spill]).astype(np.uint8)
    rgba[~keep, :3] = 0
    return rgba, bbox


def scan_video(video: Path) -> tuple[int, float, tuple[int, int, int, int]]:
    capture = open_capture(video)
    reported_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 24.0)
    bboxes: list[tuple[int, int, int, int]] = []
    decoded = 0
    while True:
        ok, bgr = capture.read()
        if not ok:
            break
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        _, bbox = clean_foreground(rgb)
        bboxes.append(bbox)
        decoded += 1
    capture.release()
    if decoded < 2 or (reported_count > 0 and decoded != reported_count):
        raise RuntimeError(
            f"{video.name}: decoded {decoded} frames, reported {reported_count}"
        )
    # Full union after detached components are removed: preserves real gait
    # translation and stable bottom-center anchoring without background sparks.
    x0 = min(bbox[0] for bbox in bboxes)
    y0 = min(bbox[1] for bbox in bboxes)
    x1 = max(bbox[2] for bbox in bboxes)
    y1 = max(bbox[3] for bbox in bboxes)
    pad_x = max(2, int(round((x1 - x0) * 0.025)))
    pad_y = max(2, int(round((y1 - y0) * 0.025)))
    global_bbox = (
        max(0, x0 - pad_x),
        max(0, y0 - pad_y),
        x1 + pad_x,
        y1 + pad_y,
    )
    return decoded, fps, global_bbox


def evenly_spaced_indices(spec: AnimationSpec, source_count: int) -> list[int]:
    start = int(round((source_count - 1) * spec.start_fraction))
    end = int(round((source_count - 1) * spec.end_fraction))
    if spec.loop and end >= source_count - 1:
        # Do not include a duplicate terminal frame when looping a full clip.
        end = max(start, source_count - 2)
    values = np.linspace(start, end, spec.frame_count)
    indices = [int(round(value)) for value in values]
    if spec.reverse:
        indices.reverse()
    if len(indices) != spec.frame_count:
        raise AssertionError(f"{spec.name}: wrong selected frame count")
    return indices


def fit_frame(rgba: np.ndarray, bbox: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = bbox
    x1 = min(rgba.shape[1], x1)
    y1 = min(rgba.shape[0], y1)
    crop = Image.fromarray(rgba[y0:y1, x0:x1])
    width, height = crop.size
    scale = (CELL * 0.90) / max(width, height)
    out_w = max(1, int(round(width * scale)))
    out_h = max(1, int(round(height * scale)))
    resized = crop.resize((out_w, out_h), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    left = (CELL - out_w) // 2
    top = max(0, CELL - out_h - 2)
    out.paste(resized, (left, top), resized)
    pixels = np.asarray(out).copy()
    pixels[..., 3] = np.where(pixels[..., 3] >= 128, 255, 0).astype(np.uint8)
    pixels[pixels[..., 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def decode_selected(
    video: Path,
    indices: Iterable[int],
    global_bbox: tuple[int, int, int, int],
) -> list[Image.Image]:
    ordered = list(indices)
    wanted = set(ordered)
    decoded: dict[int, Image.Image] = {}
    capture = open_capture(video)
    frame_index = 0
    while wanted:
        ok, bgr = capture.read()
        if not ok:
            break
        if frame_index in wanted:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            rgba, _ = clean_foreground(rgb)
            decoded[frame_index] = fit_frame(rgba, global_bbox)
            wanted.remove(frame_index)
        frame_index += 1
    capture.release()
    if wanted:
        raise RuntimeError(f"{video.name}: missing selected frames {sorted(wanted)}")
    return [decoded[index] for index in ordered]


def atlas_layout(name: str) -> tuple[dict, list[tuple[int, int, int, int]]]:
    json_path = AXO / "atlases" / f"{name}@1x.json"
    atlas = json.loads(json_path.read_text(encoding="utf-8"))
    rects = [
        (entry["frame"]["x"], entry["frame"]["y"], entry["frame"]["w"], entry["frame"]["h"])
        for entry in atlas["frames"].values()
    ]
    return atlas, rects


def save_atlas(name: str, frames: list[Image.Image]) -> None:
    atlas, rects = atlas_layout(name)
    if len(frames) != len(rects):
        raise RuntimeError(f"{name}: {len(frames)} frames != existing atlas {len(rects)}")
    meta_size = atlas["meta"]["size"]
    sheet = Image.new("RGBA", (meta_size["w"], meta_size["h"]), (0, 0, 0, 0))
    for frame, (x, y, width, height) in zip(frames, rects):
        if (width, height) != (CELL, CELL):
            raise RuntimeError(f"{name}: unexpected @1x cell {(width, height)}")
        sheet.paste(frame, (x, y), frame)
    sheet.save(AXO / "atlases" / f"{name}@1x.png", optimize=True)

    atlas2 = json.loads((AXO / "atlases" / f"{name}@2x.json").read_text(encoding="utf-8"))
    size2 = atlas2["meta"]["size"]
    sheet2 = Image.new("RGBA", (size2["w"], size2["h"]), (0, 0, 0, 0))
    rects2 = [entry["frame"] for entry in atlas2["frames"].values()]
    if len(rects2) != len(frames):
        raise RuntimeError(f"{name}: @2x frame count mismatch")
    for frame, rect in zip(frames, rects2):
        if (rect["w"], rect["h"]) != (CELL * 2, CELL * 2):
            raise RuntimeError(f"{name}: unexpected @2x cell")
        doubled = frame.resize((CELL * 2, CELL * 2), Image.Resampling.NEAREST)
        sheet2.paste(doubled, (rect["x"], rect["y"]), doubled)
    sheet2.save(AXO / "atlases" / f"{name}@2x.png", optimize=True)


def contact_sheet(frames: list[Image.Image]) -> Image.Image:
    columns = min(8, len(frames))
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGBA", (columns * 64, rows * 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        thumb = frame.resize((64, 64), Image.Resampling.NEAREST)
        sheet.paste(thumb, ((index % columns) * 64, (index // columns) * 64), thumb)
    return sheet


def main() -> int:
    if not VIDEO_DIR.is_dir():
        print(f"missing video directory: {VIDEO_DIR}", file=sys.stderr)
        return 2
    if not AXO.is_dir() or not GLITCH.is_dir():
        print("missing Axo or Glitch character directory", file=sys.stderr)
        return 2

    glitch_before = hash_tree(GLITCH)
    DOCS_CONTACTS.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    requested = set(sys.argv[1:])
    known = {spec.name for spec in SPECS}
    unknown = requested - known
    if unknown:
        print(f"unknown animation names: {sorted(unknown)}", file=sys.stderr)
        return 2
    selected_specs = [spec for spec in SPECS if not requested or spec.name in requested]

    video_cache: dict[Path, tuple[int, float, tuple[int, int, int, int]]] = {}
    for spec in selected_specs:
        video = find_video(spec)
        if video not in video_cache:
            print(f"scan {video.name}", flush=True)
            video_cache[video] = scan_video(video)
        source_count, source_fps, global_bbox = video_cache[video]
        indices = evenly_spaced_indices(spec, source_count)
        frames = decode_selected(video, indices, global_bbox)
        save_atlas(spec.name, frames)
        contacts = contact_sheet(frames)
        contacts.save(AXO / "previews" / f"{spec.name}-contact-sheet.png", optimize=True)
        contacts.save(DOCS_CONTACTS / f"axo-{spec.name}-contact-sheet.png", optimize=True)
        if spec.name == "sleepingLoop":
            contacts.save(EVIDENCE / "axo-sleeping-loop-contact-sheet.png", optimize=True)
        print(
            f"wrote {spec.name}: {len(frames)} frames from "
            f"{indices[0]}..{indices[-1]} of {source_count} @ source {source_fps:.3f}fps",
            flush=True,
        )

    glitch_after = hash_tree(GLITCH)
    if glitch_after != glitch_before:
        raise RuntimeError("Glitch tree changed during Axo rebuild")
    print(f"Glitch unchanged: {len(glitch_after)} files", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
