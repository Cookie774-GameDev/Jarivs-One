"""Generate leaderboard snapshot TS from the curated xlsx export."""
from __future__ import annotations

import json
import re
from pathlib import Path

import openpyxl

XLSX = Path(r"c:\Users\viper\Downloads\top_50_ai_models_leaderboard_2026-06-23.xlsx")
OUT = Path(__file__).resolve().parents[1] / "app" / "src" / "features" / "benchmarks" / "leaderboardSnapshot20260623.ts"
SNAPSHOT_TS = "Date.UTC(2026, 5, 23, 16, 55, 0)"


def vendor_to_provider(vendor: str) -> str:
    v = vendor.strip().lower()
    if "anthropic" in v:
        return "anthropic"
    if "openai" in v:
        return "openai"
    if "google" in v:
        return "google"
    if "meta" in v:
        return "meta"
    if "x.ai" in v or v == "xai":
        return "xai"
    if "deepseek" in v:
        return "deepseek"
    if "mistral" in v:
        return "mistral"
    if "alibaba" in v or "qwen" in v:
        return "alibaba"
    if "z.ai" in v or v == "z.ai":
        return "zai"
    if "baidu" in v:
        return "baidu"
    if "moonshot" in v:
        return "moonshot"
    if "xiaomi" in v:
        return "xiaomi"
    if "bytedance" in v:
        return "bytedance"
    if "minimax" in v:
        return "minimax"
    return re.sub(r"\s+", "", v)


def parse_context(raw: object) -> int | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() == "not listed":
        return None
    s = s.upper().replace(",", "").replace(" ", "")
    m = re.match(r"^([\d.]+)([KM])?$", s)
    if not m:
        return None
    value = float(m.group(1))
    suffix = m.group(2) or ""
    if suffix == "M":
        return int(value * 1_000_000)
    if suffix == "K":
        return int(value * 1_000)
    return int(value)


def parse_yes_no(raw: object) -> bool | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s.startswith("yes"):
        return True
    if s in {"no", "unknown", "not verified", "not officially verified"}:
        return False
    if "not " in s:
        return False
    return None


def parse_open_source(raw: object) -> bool:
    s = str(raw or "").strip().lower()
    return "open" in s


def num_or_none(raw: object) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    return None


def ts_field(name: str, value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return f"{name}: {str(value).lower()},"
    if isinstance(value, (int, float)):
        if name in {"cost_per_1m_input_usd", "cost_per_1m_output_usd"}:
            return f"{name}: {value},"
        return f"{name}: {int(value):,},".replace(",", "_")
    s = json.dumps(str(value))
    return f"{name}: {s},"


def fmt_int(n: int) -> str:
    return f"{n:,}".replace(",", "_")


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["Top 50 Models"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    data_rows = rows[1:]

    blocks: list[str] = []
    for row in data_rows:
        (
            _rank,
            _model_id,
            model,
            provider,
            license_status,
            open_closed,
            score,
            ci,
            votes,
            input_cost,
            output_cost,
            context,
            image_input,
            video_input,
            *_rest,
        ) = row

        score_i = int(score)
        ci_i = int(ci)
        provider_slug = vendor_to_provider(str(provider))
        open_source = parse_open_source(open_closed)
        license_val = str(license_status).strip()
        if license_val.lower() == "proprietary":
            license_val = "proprietary"

        fields = [
            f"model: {json.dumps(str(model))},",
            f"provider: {json.dumps(provider_slug)},",
            f"arena_score: {score_i},",
            f"ci_low: {score_i - ci_i},",
            f"ci_high: {score_i + ci_i},",
            f"open_source: {str(open_source).lower()},",
        ]
        if license_val:
            fields.append(f"license: {json.dumps(license_val)},")
        if input_cost is not None:
            fields.append(f"cost_per_1m_input_usd: {float(input_cost)},")
        if output_cost is not None:
            fields.append(f"cost_per_1m_output_usd: {float(output_cost)},")
        ctx = parse_context(context)
        if ctx is not None:
            fields.append(f"context_window: {fmt_int(ctx)},")
        if votes is not None:
            fields.append(f"votes: {fmt_int(int(votes))},")
        img = parse_yes_no(image_input)
        if img is not None:
            fields.append(f"supports_image: {str(img).lower()},")
        vid = parse_yes_no(video_input)
        if vid is not None:
            fields.append(f"supports_video: {str(vid).lower()},")
        fields.extend(
            [
                "source: 'snapshot',",
                f"fetched_at: {SNAPSHOT_TS},",
            ]
        )

        block = "  {\n    " + "\n    ".join(fields) + "\n  },"
        blocks.append(block)

    content = f"""/** Curated Top 50 — LMArena Text Arena Overall (2026-06-23 export). */
export const LEADERBOARD_SNAPSHOT_TS = {SNAPSHOT_TS};

export const LEADERBOARD_SNAPSHOT_ROWS = [
{chr(10).join(blocks)}
] as const;
"""
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {len(blocks)} rows to {OUT}")


if __name__ == "__main__":
    main()
