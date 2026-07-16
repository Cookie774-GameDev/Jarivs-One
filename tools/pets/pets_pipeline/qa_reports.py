#!/usr/bin/env python3
"""Generate contact sheets + loop/anchor/branding/alpha QA reports for Pet frames."""
from __future__ import annotations

import json
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
CHAR = ROOT / "app/src/assets/pets/characters/vibespace-axolotl-pixel"
ANIM = CHAR / "animations"
PREV = CHAR / "previews"
QA = CHAR / "qa"
CANON = CHAR / "cleaned/canonical-native-pixel-hard-alpha.png"

ANIMS = [
    "walkLeft",
    "walkRight",
    "idlePrimary",
    "idleFun",
    "welcome",
    "sleepTransition",
    "sleepingLoop",
    "wakeFromSleep",
]


def frame_paths(name: str) -> list[Path]:
    return sorted((ANIM / name / "frames").glob("frame_*.png"))


def contact_sheet(name: str, max_frames: int = 24) -> Path:
    paths = frame_paths(name)
    if not paths:
        raise FileNotFoundError(name)
    step = max(1, len(paths) // max_frames)
    sample = paths[::step][:max_frames]
    cell = 64
    cols = min(8, len(sample))
    rows = (len(sample) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (30, 30, 30, 255))
    for i, p in enumerate(sample):
        im = Image.open(p).convert("RGBA").resize((cell, cell), Image.Resampling.NEAREST)
        c, r = i % cols, i // cols
        sheet.paste(im, (c * cell, r * cell), im)
    PREV.mkdir(parents=True, exist_ok=True)
    out = PREV / f"{name}-contact-sheet.png"
    sheet.save(out)
    return out


def loop_seam(name: str) -> dict:
    paths = frame_paths(name)
    if len(paths) < 2:
        return {"anim": name, "ok": False, "reason": "too_few_frames"}
    a = np.array(Image.open(paths[0]).convert("RGBA"), dtype=np.int16)
    b = np.array(Image.open(paths[-1]).convert("RGBA"), dtype=np.int16)
    # Compare opaque region only
    mask = (a[..., 3] > 200) | (b[..., 3] > 200)
    if not mask.any():
        return {"anim": name, "ok": False, "reason": "empty"}
    diff = np.abs(a[mask] - b[mask]).mean()
    # Anchor: center of mass of alpha
    def com(arr):
        aa = arr[..., 3].astype(np.float64)
        ys, xs = np.mgrid[0 : arr.shape[0], 0 : arr.shape[1]]
        s = aa.sum()
        if s < 1:
            return (0.0, 0.0)
        return (float((xs * aa).sum() / s), float((ys * aa).sum() / s))

    c0, c1 = com(a), com(b)
    anchor_delta = ((c0[0] - c1[0]) ** 2 + (c0[1] - c1[1]) ** 2) ** 0.5
    ok = bool(diff < 45 and anchor_delta < 12)
    return {
        "anim": name,
        "ok": ok,
        "meanAbsDiff": round(float(diff), 3),
        "anchorDeltaPx": round(float(anchor_delta), 3),
        "frames": len(paths),
    }


def alpha_border_report(name: str) -> dict:
    paths = frame_paths(name)
    bad_green = 0
    bad_border = 0
    partial = 0
    checked = 0
    for p in paths[:: max(1, len(paths) // 12)]:
        arr = np.array(Image.open(p).convert("RGBA"))
        checked += 1
        a = arr[..., 3]
        # borders
        border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
        if (border > 0).any():
            # allow only if entire border row is empty of solid bg
            if (border > 16).sum() > border.size * 0.02:
                bad_border += 1
        partial += int(((a > 0) & (a < 255)).sum())
        # green full-frame residual
        rgb = arr[..., :3].astype(np.int16)
        g = rgb[..., 1]
        r = rgb[..., 0]
        b = rgb[..., 2]
        green = (a > 200) & (g > r + 25) & (g > b + 25) & (g > 90)
        if green.mean() > 0.35:
            bad_green += 1
    return {
        "anim": name,
        "framesChecked": checked,
        "badBorderSamples": bad_border,
        "partialAlphaPixelsTotal": partial,
        "greenDominantSamples": bad_green,
        "ok": bool(bad_green == 0 and bad_border == 0),
    }


def branding_report() -> dict:
    """Compare runtime frames loosely to canonical for presence of dark face + peach palette."""
    if not CANON.exists():
        return {"ok": False, "reason": "canonical missing"}
    canon = np.array(Image.open(CANON).convert("RGBA").resize((128, 128), Image.Resampling.NEAREST))
    # Canonical should have cream/peach + dark face screen
    ca = canon[..., 3] > 200
    peach = (
        (canon[..., 0] > 180)
        & (canon[..., 1] > 100)
        & (canon[..., 1] < 200)
        & (canon[..., 2] < 160)
        & ca
    )
    dark = (canon[..., 0] < 60) & (canon[..., 1] < 50) & (canon[..., 2] < 50) & ca
    report = {
        "canonicalPeachPx": int(peach.sum()),
        "canonicalDarkFacePx": int(dark.sum()),
        "perAnim": {},
        "ok": True,
        "note": "Video frames are motion refs; palette snap applied. V logos upright enforced by non-mirroring walk cycles.",
    }
    for name in ["walkLeft", "walkRight", "idlePrimary", "welcome"]:
        paths = frame_paths(name)
        if not paths:
            continue
        arr = np.array(Image.open(paths[len(paths) // 2]).convert("RGBA"))
        a = arr[..., 3] > 200
        peach_n = int(
            (
                (arr[..., 0] > 160)
                & (arr[..., 1] > 90)
                & (arr[..., 2] < 180)
                & a
            ).sum()
        )
        dark_n = int(((arr[..., 0] < 70) & (arr[..., 1] < 60) & (arr[..., 2] < 60) & a).sum())
        report["perAnim"][name] = {"peachPx": peach_n, "darkPx": dark_n, "opaque": int(a.sum())}
        # Soft check: both colors present
        if peach_n < 50 or dark_n < 20:
            report["ok"] = False
    # Separate atlases for L/R = logos not mirrored
    man = json.loads((CHAR / "animations.json").read_text(encoding="utf-8"))
    report["walkLeftAtlas"] = man["states"]["walkLeft"]["atlas"]
    report["walkRightAtlas"] = man["states"]["walkRight"]["atlas"]
    report["walkNotMirrored"] = report["walkLeftAtlas"] != report["walkRightAtlas"]
    if not report["walkNotMirrored"]:
        report["ok"] = False
    return report


def main() -> int:
    QA.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)
    sheets = {}
    seams = []
    alphas = []
    for name in ANIMS:
        if not frame_paths(name):
            continue
        sheets[name] = str(contact_sheet(name).relative_to(ROOT)).replace("\\", "/")
        if name in ("walkLeft", "walkRight", "idlePrimary", "sleepingLoop"):
            seams.append(loop_seam(name))
        alphas.append(alpha_border_report(name))

    (QA / "loop-seam-report.json").write_text(json.dumps(seams, indent=2), encoding="utf-8")
    (QA / "alpha-report.json").write_text(json.dumps(alphas, indent=2), encoding="utf-8")
    (QA / "branding-report.json").write_text(json.dumps(branding_report(), indent=2), encoding="utf-8")
    anchors = []
    for name in ANIMS:
        paths = frame_paths(name)
        if not paths:
            continue
        coms = []
        for p in paths[:: max(1, len(paths) // 8)]:
            arr = np.array(Image.open(p).convert("RGBA"))
            aa = arr[..., 3].astype(np.float64)
            ys, xs = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
            s = aa.sum()
            if s < 1:
                continue
            coms.append((float((xs * aa).sum() / s), float((ys * aa).sum() / s)))
        if coms:
            xs = [c[0] for c in coms]
            ys = [c[1] for c in coms]
            anchors.append(
                {
                    "anim": name,
                    "comXMean": round(float(np.mean(xs)), 2),
                    "comYMean": round(float(np.mean(ys)), 2),
                    "comXStd": round(float(np.std(xs)), 2),
                    "comYStd": round(float(np.std(ys)), 2),
                }
            )
    (QA / "anchor-report.json").write_text(json.dumps(anchors, indent=2), encoding="utf-8")
    (PREV / "contact-sheets.json").write_text(json.dumps(sheets, indent=2), encoding="utf-8")
    print("QA written to", QA)
    print("sheets", sheets)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
