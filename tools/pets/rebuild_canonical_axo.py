#!/usr/bin/env python3
"""Canonical Axo atlas rebuild from layered package (not glitch stamp).

1) Recompose visible layers from vibespace_axolotl layered package
2) Fit to 128/256 cells (bottom-center)
3) Motion-transfer pose from monochrome frames (position only)
4) Structural fingerprint vs recomposed master (must match cream identity)
5) Pack @1x/@2x atlases + contact sheets

Does not modify vibespace-axolotl-glitch.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PKG = Path(r"C:\Users\viper\Downloads\vibespace_axolotl_layered_package\vibespace_axolotl_layered_package")
WT = Path(r"C:\Users\viper\Documents\Codex\2026-07-11\c-users-viper-downloads-vibespace-pixel\work\VibeSpace-origin-main-20260711")
MOTION = WT / "app/src/assets/pets/characters/vibespace-axolotl-pixel/animations"
AXO = WT / "app/src/assets/pets/characters/vibespace-axolotl"
DOCS_CS = WT / "docs/pets/contact-sheets"
SCRATCH = Path(r"C:\Users\viper\AppData\Local\Temp\grok-goal-4a414697f3bf\implementer")
ANIMS = [
    "welcome", "idlePrimary", "idleFun", "walkLeft", "walkRight",
    "sleepTransition", "sleepingLoop", "wakeFromSleep",
]
CELL, CELL2 = 128, 256


def recompose_layers(pkg: Path) -> Image.Image:
    man = json.loads((pkg / "vibespace_axolotl_layer_manifest.json").read_text(encoding="utf-8"))
    canvas = man.get("canvas") or {}
    w = int(canvas.get("width") or 1254)
    h = int(canvas.get("height") or 1254)
    result = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer_order = man.get("layerOrder") or []
    # layerOrder may be list of dicts or list of ids
    layers_by_id = {}
    if isinstance(man.get("layers"), list):
        for layer in man["layers"]:
            if isinstance(layer, dict) and "id" in layer:
                layers_by_id[layer["id"]] = layer
    for entry in layer_order:
        if isinstance(entry, dict):
            layer = entry
        else:
            layer = layers_by_id.get(entry)
        if not layer:
            continue
        if layer.get("visible") is False:
            continue
        # skip guides
        file_rel = layer.get("file") or ""
        if "00_GUIDES" in file_rel or "GUIDES" in file_rel:
            continue
        path = pkg / file_rel if file_rel else None
        if path is None or not path.is_file():
            # try layers/ by id pattern
            continue
        with Image.open(path) as im:
            frame = im.convert("RGBA")
            frame.load()
        # bottom-up paint: layerOrder in this package is front-to-back (zIndex ascending = front first)
        # For alpha_composite we need back-to-front. Reverse at end by prepending?
        # Looking at layerOrder: head_v_logo first (front), then deeper. So reverse for composite.
        pass
    # Composite back-to-front
    entries = []
    for entry in layer_order:
        layer = entry if isinstance(entry, dict) else layers_by_id.get(entry)
        if not layer or layer.get("visible") is False:
            continue
        file_rel = layer.get("file") or ""
        if "GUIDES" in file_rel:
            continue
        path = pkg / file_rel
        if not path.is_file():
            continue
        entries.append(path)
    # layerOrder is front-first; composite back-first
    for path in reversed(entries):
        with Image.open(path) as im:
            frame = im.convert("RGBA")
            frame.load()
        result = Image.alpha_composite(result, frame)
    return result


def content_bbox(im: Image.Image):
    return im.split()[-1].getbbox() or (0, 0, im.width, im.height)


def fit_to_cell(im: Image.Image, cell: int, foot_pad: int = 2) -> Image.Image:
    im = im.convert("RGBA")
    crop = im.crop(content_bbox(im))
    cw, ch = crop.size
    scale = min((cell * 0.93) / max(ch, 1), (cell * 0.95) / max(cw, 1))
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    x = (cell - nw) // 2
    y = max(0, cell - nh - foot_pad)
    out.paste(resized, (x, y), resized)
    return out


def silhouette_stats(im: Image.Image) -> dict:
    arr = np.array(im.convert("RGBA"))
    a = arr[..., 3] > 32
    if not a.any():
        return {"cx": 64.0, "cy": 64.0, "h": 100.0, "w": 80.0, "foot_y": 120.0}
    ys, xs = np.where(a)
    return {
        "cx": float((xs.min() + xs.max()) / 2),
        "cy": float((ys.min() + ys.max()) / 2),
        "h": float(ys.max() - ys.min() + 1),
        "w": float(xs.max() - xs.min() + 1),
        "foot_y": float(ys.max()),
    }


def apply_pose(master: Image.Image, neutral: dict, pose: dict, cell: int) -> Image.Image:
    """Position-only transfer — never paints monochrome character."""
    dx = pose["cx"] - neutral["cx"]
    dy = pose["foot_y"] - neutral["foot_y"]
    scale = float(np.clip(pose["h"] / max(neutral["h"], 1), 0.92, 1.08))
    w, h = master.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    m = master.resize((nw, nh), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    base_x = int(np.clip((cell - nw) // 2 + dx * 0.35, -8, cell - nw + 8))
    base_y = int(np.clip(cell - nh - 2 + dy * 0.2, 0, cell - nh // 2))
    out.paste(m, (base_x, base_y), m)
    return out


def pack(frames: list[Image.Image], cell: int):
    n = len(frames)
    cols = max(1, int(math.ceil(math.sqrt(n))))
    rows = max(1, int(math.ceil(n / cols)))
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    frames_json = {}
    names = []
    for i, im in enumerate(frames):
        if im.size != (cell, cell):
            im = im.resize((cell, cell), Image.Resampling.NEAREST)
        c, r = i % cols, i // cols
        x, y = c * cell, r * cell
        sheet.paste(im, (x, y), im)
        name = f"frame_{i:03d}"
        names.append(name)
        frames_json[name] = {
            "frame": {"x": x, "y": y, "w": cell, "h": cell},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": cell, "h": cell},
            "sourceSize": {"w": cell, "h": cell},
        }
    return sheet, frames_json, names


def assert_axo_canonical_identity(frame: Image.Image, reference: Image.Image, label: str) -> None:
    """Structural fingerprint: frame must match cream master, not glitch chibi.

    Fails if:
    - corners opaque
    - mean abs RGB diff vs reference on overlapping opaque pixels is high
    - neon green corruption
    - helmet region not cream-warm
    - visor region not dark
    - white-hot eye ovals dominate visor (open-eye exposed signature vs closed glow)
    """
    f = np.array(frame.convert("RGBA"))
    r = np.array(reference.convert("RGBA").resize(frame.size, Image.Resampling.NEAREST))
    # corners
    for x, y in [(0, 0), (f.shape[1] - 1, 0), (0, f.shape[0] - 1), (f.shape[1] - 1, f.shape[0] - 1)]:
        if f[y, x, 3] != 0:
            raise AssertionError(f"{label}: opaque corner {x},{y}")
    # opaque mask intersection
    mask = (f[..., 3] > 180) & (r[..., 3] > 180)
    if mask.sum() < 200:
        raise AssertionError(f"{label}: too few overlapping opaque pixels ({mask.sum()})")
    mad = float(np.abs(f[mask, :3].astype(np.int16) - r[mask, :3].astype(np.int16)).mean())
    # Pose-shifted frames diverge more; still fail if character is totally different.
    if mad > 75:
        raise AssertionError(f"{label}: mean abs RGB vs cream master too high ({mad:.1f})")
    # neon green
    green = int(((f[..., 1] > 140) & (f[..., 0] < 90) & (f[..., 1] > f[..., 2] + 30) & (f[..., 3] > 180)).sum())
    if green > 40:
        raise AssertionError(f"{label}: neon green pixels {green}")
    h, w = f.shape[:2]
    # Sample relative to content bbox so pose shifts still hit helmet/visor
    a = f[..., 3] > 180
    ys, xs = np.where(a)
    if len(xs) < 50:
        raise AssertionError(f"{label}: no character content")
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    # helmet: upper 25% of content bbox
    hy0, hy1 = y0, y0 + int(bh * 0.28)
    hx0, hx1 = x0 + int(bw * 0.2), x0 + int(bw * 0.8)
    helmet = f[hy0:hy1, hx0:hx1]
    hm = helmet[helmet[..., 3] > 180]
    if len(hm) < 15:
        raise AssertionError(f"{label}: helmet samples missing")
    if hm[:, 0].mean() < 140 or hm[:, 1].mean() < 100:
        raise AssertionError(f"{label}: helmet not cream (mean {hm[:, :3].mean(0)})")
    # visor: mid-upper content
    vy0, vy1 = y0 + int(bh * 0.28), y0 + int(bh * 0.52)
    vx0, vx1 = x0 + int(bw * 0.28), x0 + int(bw * 0.72)
    visor = f[vy0:vy1, vx0:vx1]
    vm = visor[visor[..., 3] > 180]
    if len(vm) < 15:
        raise AssertionError(f"{label}: visor samples missing")
    if float(vm[:, :3].mean()) > 110:
        raise AssertionError(f"{label}: visor not dark enough (mean {vm[:, :3].mean():.1f})")
    # Open white-eye ovals: large near-white clusters in visor (closed glow is peach/yellow, not white)
    bright_white = (vm[:, 0] > 230) & (vm[:, 1] > 230) & (vm[:, 2] > 220)
    if bright_white.sum() > max(25, len(vm) * 0.10):
        raise AssertionError(
            f"{label}: bright-white visor ovals (exposed-eye signature) {bright_white.sum()}/{len(vm)}"
        )
    # Cream body on torso
    cy0, cy1 = y0 + int(bh * 0.55), y0 + int(bh * 0.78)
    cx0, cx1 = x0 + int(bw * 0.3), x0 + int(bw * 0.7)
    chest = f[cy0:cy1, cx0:cx1]
    cm = chest[chest[..., 3] > 180]
    if len(cm) > 10:
        creamish = (cm[:, 0] > 150) & (cm[:, 1] > 110) & (cm[:, 2] > 85)
        if creamish.sum() < 5:
            raise AssertionError(f"{label}: chest region missing cream body")

def main() -> int:
    if not PKG.is_dir():
        print("MISSING layered package", PKG, file=sys.stderr)
        return 1
    print("Recomposing layers from", PKG)
    full = recompose_layers(PKG)
    full.save(SCRATCH / "axo-recomposed-full.png")
    master = fit_to_cell(full, CELL)
    master2 = fit_to_cell(full, CELL2)
    AXO.mkdir(parents=True, exist_ok=True)
    (AXO / "atlases").mkdir(exist_ok=True)
    (AXO / "previews").mkdir(exist_ok=True)
    DOCS_CS.mkdir(parents=True, exist_ok=True)
    master.save(AXO / "previews/reference-cream.png")
    master2.save(AXO / "previews/portrait-cream.png")
    master2.save(AXO / "previews/portrait.png")
    assert_axo_canonical_identity(master, master, "master")

    neutral_path = MOTION / "idlePrimary/frames/frame_000.png"
    neutral = silhouette_stats(Image.open(neutral_path)) if neutral_path.exists() else {
        "cx": 64.0, "cy": 64.0, "h": 100.0, "w": 80.0, "foot_y": 120.0
    }
    existing = {}
    if (AXO / "animations.json").exists():
        existing = json.loads((AXO / "animations.json").read_text(encoding="utf-8"))
    # preserve FPS from glitch/pixel manifests if needed
    glitch_man = WT / "app/src/assets/pets/characters/vibespace-axolotl-glitch/animations.json"
    if glitch_man.exists():
        existing = json.loads(glitch_man.read_text(encoding="utf-8"))

    manifest = {
        "schemaVersion": 1,
        "characterId": "vibespace-axolotl",
        "defaultState": "idlePrimary",
        "states": {},
        "scheduler": existing.get("scheduler") or {"idleFunIntervalMs": 60000, "sleepTimeoutMs": 300000},
        "drag": existing.get("drag") or {"directionThresholdPx": 4, "stopThresholdPx": 2},
    }

    for anim in ANIMS:
        files = sorted((MOTION / anim / "frames").glob("frame_*.png")) if (MOTION / anim / "frames").exists() else []
        state = (existing.get("states") or {}).get(anim) or {}
        fps = state.get("fps") or 12
        loop = state.get("loop", True)
        one_shot = state.get("oneShot", not loop)
        frames: list[Image.Image] = []
        if files:
            for fp in files:
                pose = silhouette_stats(Image.open(fp).convert("RGBA"))
                frames.append(apply_pose(master, neutral, pose, CELL))
        else:
            for i in range(12):
                bob = int(round(math.sin(i / 12 * math.pi * 2) * 2))
                f = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
                f.paste(master, (0, bob), master)
                frames.append(f)

        # Fingerprint every 8th frame + first/last
        check_idx = sorted(set([0, len(frames) // 2, len(frames) - 1] + list(range(0, len(frames), max(1, len(frames) // 8)))))
        for i in check_idx:
            assert_axo_canonical_identity(frames[i], master, f"{anim}[{i}]")

        sheet1, fj, names = pack(frames, CELL)
        sheet1.save(AXO / "atlases" / f"{anim}@1x.png", optimize=True)
        (AXO / "atlases" / f"{anim}@1x.json").write_text(json.dumps({
            "frames": fj,
            "animations": {anim: names},
            "meta": {
                "app": "VibeSpace Pets",
                "version": "1.0",
                "image": f"{anim}@1x.png",
                "format": "RGBA8888",
                "size": {"w": sheet1.width, "h": sheet1.height},
                "scale": "1",
            },
        }, indent=2), encoding="utf-8")
        frames2 = [f.resize((CELL2, CELL2), Image.Resampling.NEAREST) for f in frames]
        sheet2, fj2, names2 = pack(frames2, CELL2)
        sheet2.save(AXO / "atlases" / f"{anim}@2x.png", optimize=True)
        (AXO / "atlases" / f"{anim}@2x.json").write_text(json.dumps({
            "frames": fj2,
            "animations": {anim: names2},
            "meta": {
                "app": "VibeSpace Pets",
                "version": "1.0",
                "image": f"{anim}@2x.png",
                "format": "RGBA8888",
                "size": {"w": sheet2.width, "h": sheet2.height},
                "scale": "2",
            },
        }, indent=2), encoding="utf-8")
        cols = min(8, len(frames))
        rows = math.ceil(len(frames) / cols)
        cs = Image.new("RGBA", (cols * 64, rows * 64), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            t = f.resize((64, 64), Image.Resampling.NEAREST)
            cs.paste(t, ((i % cols) * 64, (i // cols) * 64), t)
        cs.save(DOCS_CS / f"axo-{anim}-contact-sheet.png")
        cs.save(AXO / "previews" / f"{anim}-contact-sheet.png")
        frames[0].save(SCRATCH / f"axo-{anim}-frame0.png")
        print(f"OK {anim} frames={len(frames)} fps={fps}")
        manifest["states"][anim] = {
            "frames": names,
            "fps": fps,
            "frameDurationMs": int(round(1000 / max(fps, 0.1))),
            "loop": loop,
            "interruptible": state.get("interruptible", True),
            "priority": state.get("priority", 10),
            "fallbackState": state.get("fallbackState", "idlePrimary"),
            "reducedMotionState": state.get("reducedMotionState", "idlePrimary"),
            "atlas": f"atlases/{anim}@1x.json",
            "atlas2x": f"atlases/{anim}@2x.json",
            "oneShot": one_shot,
        }

    (AXO / "animations.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    # Export fingerprint helper sample for tests to compare
    master.save(AXO / "previews/canonical-master-128.png")
    print("DONE characterId=vibespace-axolotl")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
