#!/usr/bin/env python3
"""
Stage A/B pipeline: extract MP4 frames → chroma-key → crop → select runtime frames.

Does NOT commit temp full-res caches. Writes:
  - docs/pets/VIDEO_SOURCE_INSPECTION.json
  - app/src/assets/pets/characters/.../animations/<name>/frames/*.png
  - app/src/assets/pets/characters/.../animations/<name>/meta.json
  - tools/pets/tmp_video_cache/ (local only, gitignored)

Identity repair: hard alpha + palette snap against canonical palette when available.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image

# Worktree-relative defaults
ROOT = Path(__file__).resolve().parents[3]
VID_DIR = Path(
    r"C:\Users\viper\Downloads\VibeSpaceOs\vibespace_axolotl_layered_package\vIDEOS!"
)
CHAR_DIR = ROOT / "app/src/assets/pets/characters/vibespace-axolotl-pixel"
ANIM_DIR = CHAR_DIR / "animations"
TMP = ROOT / "tools/pets/tmp_video_cache"
DOCS = ROOT / "docs/pets"
PALETTE_PATH = CHAR_DIR / "source/palette.json"
CANONICAL = CHAR_DIR / "cleaned/canonical-native-pixel-hard-alpha.png"

# Target native cell size (from validation: 209×209 @ scale 6)
NATIVE = 128  # runtime sprite size (square); nearest-neighbor from crop


@dataclass
class VideoSpec:
    anim: str
    pattern: str
    loop: bool
    one_shot: bool
    target_frames: tuple[int, int]
    target_fps: tuple[float, float]
    # For sleep: extract loop from end portion
    sleep_loop_tail_seconds: float | None = None


SPECS: list[VideoSpec] = [
    VideoSpec("walkRight", r"Axolotl_walking_in_place_animation_202607111701", True, False, (12, 20), (10, 16)),
    VideoSpec("walkLeft", r"Axolotl_walking_cycle_left_202607111648", True, False, (12, 20), (10, 16)),
    VideoSpec("idlePrimary", r"Axolotl_character_breathing_and", True, False, (24, 48), (10, 16)),
    VideoSpec("idleFun", r"Axolotl_character_2nd.?idle", False, True, (30, 60), (12, 18)),
    VideoSpec("welcome", r"Axolotl_character_pixel_art_Welcome", False, True, (36, 60), (12, 18)),
    VideoSpec("sleepTransition", r"Axolotl_transitions_to_sleep_202607111658", False, True, (60, 120), (12, 18), sleep_loop_tail_seconds=2.5),
]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_video(pattern: str) -> Path:
    rx = re.compile(pattern, re.I)
    hits = [p for p in VID_DIR.glob("*.mp4") if rx.search(p.name)]
    if not hits:
        raise FileNotFoundError(f"No video matching {pattern} in {VID_DIR}")
    return sorted(hits, key=lambda p: p.stat().st_mtime)[-1]


def ffprobe(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,r_frame_rate,nb_frames,duration",
        "-of",
        "json",
        str(path),
    ]
    out = subprocess.check_output(cmd, text=True)
    data = json.loads(out)
    s = data["streams"][0]
    fr = s.get("r_frame_rate", "24/1")
    if "/" in fr:
        a, b = fr.split("/")
        fps = float(a) / float(b) if float(b) else 24.0
    else:
        fps = float(fr)
    return {
        "width": int(s["width"]),
        "height": int(s["height"]),
        "fps": fps,
        "nb_frames": int(s.get("nb_frames") or 0),
        "duration": float(s.get("duration") or 0),
    }


def extract_all_frames(video: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Lossless-ish PNG sequence
    pattern = str(out_dir / "src_%04d.png")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video),
        "-vsync",
        "0",
        pattern,
    ]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return sorted(out_dir.glob("src_*.png"))


def is_green_bg(rgb: np.ndarray) -> np.ndarray:
    """Boolean mask True where pixel is chroma green (or near-black letterbox)."""
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    # Green screen: G high relative to R/B
    green = (g > 70) & (g > r * 1.15) & (g > b * 1.15) & ((g - r) > 20) & ((g - b) > 15)
    # Pure black bars
    black = (r < 18) & (g < 18) & (b < 18)
    # Near-white canvas
    white = (r > 245) & (g > 245) & (b > 245)
    return green | black | white


def chroma_key_rgba(im: Image.Image) -> Image.Image:
    rgb = np.array(im.convert("RGB"))
    mask_bg = is_green_bg(rgb)
    rgba = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(mask_bg, 0, 255)
    # Kill green spill on edge pixels (desaturate residual green)
    a = rgba[..., 3] > 0
    r, g, b = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    spill = a & (g.astype(np.int16) > r.astype(np.int16) + 12) & (g.astype(np.int16) > b.astype(np.int16) + 12)
    # Pull g toward max(r,b)
    g2 = g.copy()
    g2[spill] = np.maximum(r[spill], b[spill])
    rgba[..., 1] = g2
    return Image.fromarray(rgba, "RGBA")


def content_bbox(im: Image.Image, pad: int = 4) -> tuple[int, int, int, int] | None:
    a = np.array(im.split()[-1])
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return None
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return x0, y0, x1, y1


def crop_to_square(im: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = bbox
    crop = im.crop((x0, y0, x1, y1))
    w, h = crop.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - w) // 2
    oy = (side - h) // 2
    canvas.paste(crop, (ox, oy), crop)
    return canvas


def hard_alpha(im: Image.Image, thr: int = 96) -> Image.Image:
    arr = np.array(im)
    a = arr[..., 3]
    arr[..., 3] = np.where(a >= thr, 255, 0)
    # Zero RGB where transparent
    mask = arr[..., 3] == 0
    arr[mask, 0] = 0
    arr[mask, 1] = 0
    arr[mask, 2] = 0
    return Image.fromarray(arr, "RGBA")


def load_palette() -> np.ndarray | None:
    if not PALETTE_PATH.exists():
        return None
    data = json.loads(PALETTE_PATH.read_text(encoding="utf-8"))
    cols = []
    for c in data.get("colors", []):
        rgb = c.get("rgb")
        if rgb and len(rgb) == 3:
            cols.append(rgb)
    if not cols:
        return None
    return np.array(cols, dtype=np.int16)


def snap_palette(im: Image.Image, palette: np.ndarray | None) -> Image.Image:
    if palette is None:
        return im
    arr = np.array(im)
    a = arr[..., 3] > 0
    if not np.any(a):
        return im
    pix = arr[a, :3].astype(np.int16)
    # nearest palette
    # (N,1,3) - (1,P,3)
    d = ((pix[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    idx = d.argmin(axis=1)
    arr[a, :3] = palette[idx].astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def frame_hash(im: Image.Image) -> str:
    # Hash alpha+downsampled for near-dupe detection
    small = im.resize((48, 48), Image.Resampling.NEAREST)
    return hashlib.sha1(small.tobytes()).hexdigest()


def select_frames(
    paths: list[Path],
    target_min: int,
    target_max: int,
    force_keep_indices: set[int] | None = None,
) -> list[int]:
    """Pick evenly spaced meaningful frames, dropping exact near-duplicates."""
    force_keep_indices = force_keep_indices or set()
    hashes: list[str] = []
    for p in paths:
        im = Image.open(p)
        hashes.append(frame_hash(im))
    # Drop consecutive exact dups
    keep = [0]
    for i in range(1, len(paths)):
        if hashes[i] != hashes[keep[-1]] or i in force_keep_indices:
            keep.append(i)
    if len(keep) <= target_max:
        # Ensure min density by adding midpoints if too sparse
        if len(keep) < target_min and len(paths) > len(keep):
            step = max(1, len(paths) // target_min)
            denser = sorted(set(range(0, len(paths), step)) | set(keep) | force_keep_indices)
            keep = denser[:target_max] if len(denser) > target_max else denser
        return keep
    # Downsample keep list evenly to target_max
    n = target_max
    idxs = [keep[int(round(i * (len(keep) - 1) / (n - 1)))] for i in range(n)]
    return sorted(set(idxs) | (force_keep_indices & set(range(len(paths)))))


def process_anim(spec: VideoSpec) -> dict:
    video = find_video(spec.pattern)
    meta = ffprobe(video)
    raw_dir = TMP / "raw" / spec.anim
    keyed_dir = TMP / "keyed" / spec.anim
    if raw_dir.exists():
        shutil.rmtree(raw_dir)
    if keyed_dir.exists():
        shutil.rmtree(keyed_dir)
    raw_dir.mkdir(parents=True)
    keyed_dir.mkdir(parents=True)

    print(f"[{spec.anim}] extracting {video.name} ...", flush=True)
    frames = extract_all_frames(video, raw_dir)
    if not frames:
        raise RuntimeError(f"No frames from {video}")

    palette = load_palette()
    # Union bbox across sampled frames for stable crop
    bboxes = []
    keyed_paths: list[Path] = []
    for i, fp in enumerate(frames):
        im = Image.open(fp)
        rgba = chroma_key_rgba(im)
        bb = content_bbox(rgba)
        if bb:
            bboxes.append(bb)
        outp = keyed_dir / f"k_{i:04d}.png"
        rgba.save(outp)
        keyed_paths.append(outp)

    if not bboxes:
        raise RuntimeError(f"No content in {spec.anim}")
    # Global bbox
    x0 = min(b[0] for b in bboxes)
    y0 = min(b[1] for b in bboxes)
    x1 = max(b[2] for b in bboxes)
    y1 = max(b[3] for b in bboxes)
    global_bb = (x0, y0, x1, y1)

    cropped: list[Image.Image] = []
    for kp in keyed_paths:
        im = Image.open(kp).convert("RGBA")
        sq = crop_to_square(im, global_bb)
        sq = sq.resize((NATIVE, NATIVE), Image.Resampling.NEAREST)
        sq = hard_alpha(sq)
        sq = snap_palette(sq, palette)
        cropped.append(sq)

    # Save all cropped temporarily for selection
    crop_dir = TMP / "cropped" / spec.anim
    if crop_dir.exists():
        shutil.rmtree(crop_dir)
    crop_dir.mkdir(parents=True)
    crop_paths = []
    for i, im in enumerate(cropped):
        p = crop_dir / f"c_{i:04d}.png"
        im.save(p)
        crop_paths.append(p)

    # Special: sleepTransition + sleepingLoop split
    results = []
    if spec.anim == "sleepTransition" and spec.sleep_loop_tail_seconds:
        fps = meta["fps"] or 24
        total = len(crop_paths)
        tail_n = int(spec.sleep_loop_tail_seconds * fps)
        split = max(1, total - tail_n)
        # Transition: beginning → split
        t_idxs = select_frames(crop_paths[:split], 60, 120)
        write_anim_frames("sleepTransition", [crop_paths[i] for i in t_idxs], meta, loop=False, one_shot=True, fps_hint=14)
        # Loop: tail — find best cycle by comparing first of tail to later frames
        tail = crop_paths[split:]
        loop_idxs = select_sleep_loop(tail)
        write_anim_frames("sleepingLoop", [tail[i] for i in loop_idxs], meta, loop=True, one_shot=False, fps_hint=10)
        # wakeFromSleep: reverse of last few sleep transition frames + first idle-like
        wake_src = [crop_paths[i] for i in t_idxs[-8:]][::-1]
        if len(wake_src) < 6:
            wake_src = list(reversed(crop_paths[max(0, split - 8) : split]))
        write_anim_frames("wakeFromSleep", wake_src[:12], meta, loop=False, one_shot=True, fps_hint=24)
        results.append(
            {
                "anim": "sleepTransition+sleepingLoop+wakeFromSleep",
                "source": video.name,
                "checksum": sha256_file(video),
                "probe": meta,
                "globalBBox": global_bb,
            }
        )
        return results[0]

    idxs = select_frames(crop_paths, spec.target_frames[0], spec.target_frames[1])
    fps_mid = (spec.target_fps[0] + spec.target_fps[1]) / 2
    write_anim_frames(
        spec.anim,
        [crop_paths[i] for i in idxs],
        meta,
        loop=spec.loop,
        one_shot=spec.one_shot,
        fps_hint=fps_mid,
    )
    return {
        "anim": spec.anim,
        "source": video.name,
        "checksum": sha256_file(video),
        "probe": meta,
        "selected": len(idxs),
        "sourceFrameCount": len(frames),
        "globalBBox": global_bb,
        "loop": spec.loop,
        "oneShot": spec.one_shot,
        "fps": fps_mid,
    }


def select_sleep_loop(tail_paths: list[Path]) -> list[int]:
    if len(tail_paths) <= 20:
        return list(range(len(tail_paths)))
    # Prefer middle of tail for stable sleep pose cycling
    start = len(tail_paths) // 4
    end = len(tail_paths)
    segment = tail_paths[start:end]
    idxs = select_frames(segment, 16, 40)
    return [start + i for i in idxs]


def write_anim_frames(
    name: str,
    frame_paths: list[Path],
    probe: dict,
    *,
    loop: bool,
    one_shot: bool,
    fps_hint: float,
) -> None:
    out = ANIM_DIR / name / "frames"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    duration_ms = int(round(1000 / max(fps_hint, 1)))
    frame_names = []
    for i, src in enumerate(frame_paths):
        dest = out / f"frame_{i:03d}.png"
        Image.open(src).convert("RGBA").save(dest)
        frame_names.append(dest.name)
    meta = {
        "schemaVersion": 1,
        "characterId": "vibespace-axolotl-pixel",
        "animationId": name,
        "loop": loop,
        "oneShot": one_shot,
        "fps": round(fps_hint, 2),
        "frameDurationMs": duration_ms,
        "frameCount": len(frame_names),
        "canvas": {"width": NATIVE, "height": NATIVE},
        "frames": frame_names,
        "sourceProbe": probe,
    }
    (ANIM_DIR / name / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"  wrote {name}: {len(frame_names)} frames @ ~{fps_hint:.1f}fps", flush=True)


def main() -> int:
    if not VID_DIR.is_dir():
        print("VIDEO DIR missing", VID_DIR, file=sys.stderr)
        return 2
    TMP.mkdir(parents=True, exist_ok=True)
    ANIM_DIR.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    report = {
        "characterId": "vibespace-axolotl-pixel",
        "nativeCanvas": NATIVE,
        "videos": [],
        "method": {
            "chromaKey": "HSV-ish green + black letterbox + white canvas mask; green spill desaturation",
            "scale": "NEAREST to square NATIVE",
            "alpha": "hard threshold 96",
            "palette": "nearest snap to source/palette.json when present",
        },
    }
    for spec in SPECS:
        try:
            r = process_anim(spec)
            report["videos"].append(r)
        except Exception as e:
            print(f"ERROR {spec.anim}: {e}", file=sys.stderr)
            report["videos"].append({"anim": spec.anim, "error": str(e)})
            return 1

    (DOCS / "VIDEO_SOURCE_INSPECTION.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Wrote", DOCS / "VIDEO_SOURCE_INSPECTION.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
