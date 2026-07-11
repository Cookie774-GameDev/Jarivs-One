#!/usr/bin/env python3
"""Pack per-animation transparent PNG frames into PixiJS-compatible atlases (1x)."""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
CHAR = ROOT / "app/src/assets/pets/characters/vibespace-axolotl-pixel"
ANIM = CHAR / "animations"
ATLAS_DIR = CHAR / "atlases"
DOCS = ROOT / "docs/pets"

ANIMS = [
    "walkRight",
    "walkLeft",
    "idlePrimary",
    "idleFun",
    "welcome",
    "sleepTransition",
    "sleepingLoop",
    "wakeFromSleep",
]


def pack_sheet(frames: list[Path], cell: int) -> tuple[Image.Image, dict, list[str]]:
    n = len(frames)
    cols = max(1, int(math.ceil(math.sqrt(n))))
    rows = max(1, int(math.ceil(n / cols)))
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    frames_json: dict = {}
    names: list[str] = []
    for i, fp in enumerate(frames):
        im = Image.open(fp).convert("RGBA")
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


def main() -> int:
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    animations_manifest: dict = {
        "schemaVersion": 1,
        "characterId": "vibespace-axolotl-pixel",
        "defaultState": "idlePrimary",
        "states": {},
        "scheduler": {
            "idleFunIntervalMs": 60000,
            "sleepTimeoutMs": 300000,
        },
        "drag": {
            "directionThresholdPx": 4,
            "stopThresholdPx": 2,
        },
    }
    report = {"atlases": [], "cell": None}

    for anim in ANIMS:
        meta_path = ANIM / anim / "meta.json"
        frames_dir = ANIM / anim / "frames"
        if not meta_path.exists() or not frames_dir.exists():
            print("skip missing", anim)
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        frame_files = sorted(frames_dir.glob("frame_*.png"))
        if not frame_files:
            print("skip empty", anim)
            continue
        cell = meta.get("canvas", {}).get("width") or Image.open(frame_files[0]).size[0]
        report["cell"] = cell
        sheet, frames_json, names = pack_sheet(frame_files, cell)
        sheet_name = f"{anim}@1x.png"
        json_name = f"{anim}@1x.json"
        sheet_path = ATLAS_DIR / sheet_name
        json_path = ATLAS_DIR / json_name
        sheet.save(sheet_path, optimize=True)
        atlas = {
            "frames": frames_json,
            "animations": {anim: names},
            "meta": {
                "app": "VibeSpace Pets",
                "version": "1.0",
                "image": sheet_name,
                "format": "RGBA8888",
                "size": {"w": sheet.width, "h": sheet.height},
                "scale": "1",
                "related_multi_packs": [],
            },
        }
        json_path.write_text(json.dumps(atlas, indent=2), encoding="utf-8")
        # 2x nearest-neighbor upscale for retina
        sheet2 = sheet.resize((sheet.width * 2, sheet.height * 2), Image.Resampling.NEAREST)
        sheet2_name = f"{anim}@2x.png"
        json2_name = f"{anim}@2x.json"
        sheet2.save(ATLAS_DIR / sheet2_name, optimize=True)
        frames2 = {}
        for k, v in frames_json.items():
            f = v["frame"]
            frames2[k] = {
                **v,
                "frame": {"x": f["x"] * 2, "y": f["y"] * 2, "w": f["w"] * 2, "h": f["h"] * 2},
                "spriteSourceSize": {
                    "x": 0,
                    "y": 0,
                    "w": f["w"] * 2,
                    "h": f["h"] * 2,
                },
                "sourceSize": {"w": f["w"] * 2, "h": f["h"] * 2},
            }
        atlas2 = {
            "frames": frames2,
            "animations": {anim: names},
            "meta": {
                **atlas["meta"],
                "image": sheet2_name,
                "size": {"w": sheet2.width, "h": sheet2.height},
                "scale": "2",
            },
        }
        (ATLAS_DIR / json2_name).write_text(json.dumps(atlas2, indent=2), encoding="utf-8")

        loop = bool(meta.get("loop"))
        one_shot = bool(meta.get("oneShot"))
        priority = {
            "welcome": 90,
            "walkLeft": 80,
            "walkRight": 80,
            "wakeFromSleep": 75,
            "sleepTransition": 70,
            "sleepingLoop": 65,
            "idleFun": 40,
            "idlePrimary": 10,
        }.get(anim, 20)
        animations_manifest["states"][anim] = {
            "frames": names,
            "fps": meta.get("fps", 12),
            "frameDurationMs": meta.get("frameDurationMs"),
            "loop": loop,
            "interruptible": anim in ("idlePrimary", "idleFun", "sleepingLoop"),
            "priority": priority,
            "fallbackState": "idlePrimary" if anim != "idlePrimary" else None,
            "reducedMotionState": "idlePrimary",
            "atlas": f"atlases/{json_name}",
            "atlas2x": f"atlases/{json2_name}",
            "oneShot": one_shot,
        }
        report["atlases"].append(
            {
                "anim": anim,
                "frames": len(names),
                "sheet1x": {"w": sheet.width, "h": sheet.height, "bytes": sheet_path.stat().st_size},
                "sheet2x": {"w": sheet2.width, "h": sheet2.height},
            }
        )
        print(f"packed {anim}: {len(names)} frames → {sheet.width}x{sheet.height}")

    # Strip nulls for schema friendliness
    for st in animations_manifest["states"].values():
        if st.get("fallbackState") is None:
            del st["fallbackState"]

    man_path = CHAR / "animations.json"
    man_path.write_text(json.dumps(animations_manifest, indent=2), encoding="utf-8")
    (DOCS / "ATLAS_PACK_REPORT.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Wrote", man_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
