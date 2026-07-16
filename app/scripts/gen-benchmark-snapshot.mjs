/**
 * Regenerates the curated Top-50 UNIQUE model snapshot.
 *
 * Source: Top_50_UNIQUE_AI_Models_One_Model_Per_Row_July_2026.xlsx
 * (AA Intelligence Index + OpenRouter pricing, one base model per row).
 *
 * Run: node scripts/gen-benchmark-snapshot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Top 50 unique models — AA Intelligence + OpenRouter (Jul 11, 2026). */
const rows = [
  { model: 'Claude Fable 5', provider: 'anthropic', score: 60, open: false, license: 'proprietary', input: 10, output: 50, ctx: 1000000, img: true, vid: false },
  { model: 'GPT-5.6 Sol', provider: 'openai', score: 58.9, open: false, license: 'proprietary', input: 5, output: 30, ctx: 1050000, img: true, vid: false },
  { model: 'Claude Opus 4.8', provider: 'anthropic', score: 56, open: false, license: 'proprietary', input: 5, output: 25, ctx: 1000000, img: true, vid: false },
  { model: 'GPT-5.6 Terra', provider: 'openai', score: 55, open: false, license: 'proprietary', input: 2.5, output: 15, ctx: 1050000, img: true, vid: false },
  { model: 'GPT-5.5', provider: 'openai', score: 55, open: false, license: 'proprietary', input: 5, output: 30, ctx: 1050000, img: true, vid: false },
  { model: 'Grok 4.5', provider: 'xai', score: 53.8, open: false, license: 'proprietary', input: 2, output: 6, ctx: 500000, img: true, vid: false },
  { model: 'Claude Opus 4.7', provider: 'anthropic', score: 53.5, open: false, license: 'proprietary', input: 5, output: 25, ctx: 1000000, img: true, vid: false },
  { model: 'Claude Sonnet 5', provider: 'anthropic', score: 53, open: false, license: 'proprietary', input: 2, output: 10, ctx: 1000000, img: true, vid: false },
  { model: 'Claude Opus 4.6', provider: 'anthropic', score: 52, open: false, license: 'proprietary', input: 5, output: 25, ctx: 1000000, img: true, vid: false },
  { model: 'GPT-5.4', provider: 'openai', score: 51.4, open: false, license: 'proprietary', input: 2.5, output: 15, ctx: 1050000, img: true, vid: false },
  { model: 'GPT-5.6 Luna', provider: 'openai', score: 51.2, open: false, license: 'proprietary', input: 1, output: 6, ctx: 1050000, img: true, vid: false },
  { model: 'GLM-5.2', provider: 'zai', score: 51, open: true, license: 'MIT', input: 0.35, output: 1.1, ctx: 1000000, img: false, vid: false },
  { model: 'Gemini 3.5 Flash', provider: 'google', score: 50, open: false, license: 'proprietary', input: 1.5, output: 9, ctx: 1048576, img: true, vid: true },
  { model: 'Claude Sonnet 4.6', provider: 'anthropic', score: 47.2, open: false, license: 'proprietary', input: 3, output: 15, ctx: 1000000, img: true, vid: false },
  { model: 'Claude Opus 4.5', provider: 'anthropic', score: 47, open: false, license: 'proprietary', input: 5, output: 25, ctx: 200000, img: true, vid: false },
  { model: 'Gemini 3.1 Pro Preview', provider: 'google', score: 46.5, open: false, license: 'proprietary', input: 2, output: 12, ctx: 1048576, img: true, vid: true },
  { model: 'Qwen3.7 Max', provider: 'alibaba', score: 46, open: false, license: 'proprietary', input: 1.25, output: 3.75, ctx: 1000000, img: false, vid: false },
  { model: 'MiniMax M3', provider: 'minimax', score: 44.4, open: true, license: 'Model license', input: 0.3, output: 1.2, ctx: 1048576, img: true, vid: true },
  { model: 'Kimi K2.6', provider: 'moonshot', score: 44.2, open: true, license: 'Modified MIT', input: 0.66, output: 3.41, ctx: 262144, img: true, vid: false },
  { model: 'GPT-5.3 Codex', provider: 'openai', score: 44, open: false, license: 'proprietary', input: 1.25, output: 10, ctx: 400000, img: true, vid: false },
  { model: 'DeepSeek V4 Pro', provider: 'deepseek', score: 44, open: true, license: 'MIT', input: 0.435, output: 0.87, ctx: 1000000, img: false, vid: false },
  { model: 'Claude Sonnet 4.5', provider: 'anthropic', score: 44, open: false, license: 'proprietary', input: 3, output: 15, ctx: 200000, img: true, vid: false },
  { model: 'MiMo V2.5 Pro', provider: 'xiaomi', score: 42.2, open: true, license: 'MIT', input: 0.435, output: 0.87, ctx: 1048576, img: false, vid: false },
  { model: 'Kimi K2.7 Code', provider: 'moonshot', score: 41.9, open: true, license: 'Modified MIT', input: 0.72, output: 3.5, ctx: 262144, img: true, vid: false },
  { model: 'Nex N2 Pro', provider: 'nexagi', score: 41, open: true, license: 'Model license', input: 0.25, output: 1, ctx: 262144, img: true, vid: false },
  { model: 'GLM-5.1', provider: 'zai', score: 40.2, open: true, license: 'MIT', input: 0.966, output: 3.036, ctx: 202752, img: false, vid: false },
  { model: 'Grok Build 0.1', provider: 'xai', score: 40, open: false, license: 'proprietary', input: 1, output: 2, ctx: 262144, img: true, vid: false },
  { model: 'GPT-5.4 Mini', provider: 'openai', score: 40, open: false, license: 'proprietary', input: 0.75, output: 4.5, ctx: 400000, img: true, vid: false },
  { model: 'Qwen3.6 Plus', provider: 'alibaba', score: 40, open: false, license: 'proprietary', input: 0.325, output: 1.95, ctx: 1000000, img: true, vid: true },
  { model: 'DeepSeek V4 Flash', provider: 'deepseek', score: 40, open: true, license: 'MIT', input: 0.077, output: 0.154, ctx: 1000000, img: false, vid: false },
  { model: 'Qwen3.7 Plus', provider: 'alibaba', score: 39, open: false, license: 'proprietary', input: 0.32, output: 1.28, ctx: 1000000, img: true, vid: false },
  { model: 'Nemotron 3 Ultra', provider: 'nvidia', score: 38, open: true, license: 'NVIDIA Open Model License', input: 0.5, output: 2.2, ctx: 262144, img: false, vid: false },
  { model: 'Grok 4.3', provider: 'xai', score: 38, open: false, license: 'proprietary', input: 1.25, output: 2.5, ctx: 1000000, img: true, vid: false },
  { model: 'MiniMax M2.7', provider: 'minimax', score: 38, open: true, license: 'Model license', input: 0.24, output: 0.96, ctx: 204800, img: false, vid: false },
  { model: 'GPT-5.4 Nano', provider: 'openai', score: 38, open: false, license: 'proprietary', input: 0.2, output: 1.25, ctx: 400000, img: true, vid: false },
  { model: 'MiMo V2.5', provider: 'xiaomi', score: 37.2, open: true, license: 'MIT', input: 0.105, output: 0.28, ctx: 1048576, img: true, vid: true },
  { model: 'Qwen3.6 27B', provider: 'alibaba', score: 37, open: true, license: 'Apache 2.0', input: 0.285, output: 2.4, ctx: 262144, img: true, vid: true },
  { model: 'Qwen3.5 Plus', provider: 'alibaba', score: 34, open: false, license: 'proprietary', input: 0.26, output: 1.56, ctx: 1000000, img: true, vid: true },
  { model: 'Qwen3.5 397B A17B', provider: 'alibaba', score: 33.7, open: true, license: 'Apache 2.0', input: 0.385, output: 2.45, ctx: 256000, img: true, vid: true },
  { model: 'Qwen3.5 122B A10B', provider: 'alibaba', score: 32.3, open: true, license: 'Apache 2.0', input: 0.26, output: 2.08, ctx: 262144, img: true, vid: true },
  { model: 'Qwen3.6 35B A3B', provider: 'alibaba', score: 31.6, open: true, license: 'Apache 2.0', input: 0.14, output: 1, ctx: 262144, img: true, vid: true },
  { model: 'Step 3.7 Flash', provider: 'stepfun', score: 30.3, open: true, license: 'Model license', input: 0.2, output: 1.15, ctx: 256000, img: true, vid: true },
  { model: 'Qwen3.5 Flash', provider: 'alibaba', score: 30, open: false, license: 'proprietary', input: 0.065, output: 0.26, ctx: 1000000, img: true, vid: true },
  { model: 'Mistral Medium 3.5', provider: 'mistral', score: 29.9, open: false, license: 'proprietary', input: 1.5, output: 7.5, ctx: 262144, img: true, vid: false },
  { model: 'Claude Haiku 4.5', provider: 'anthropic', score: 29.6, open: false, license: 'proprietary', input: 1, output: 5, ctx: 200000, img: true, vid: false },
  { model: 'Gemma 4 31B', provider: 'google', score: 29.4, open: true, license: 'Gemma license', input: 0.14, output: 0.4, ctx: 262144, img: true, vid: true },
  { model: 'Qwen3.5 27B', provider: 'alibaba', score: 29, open: true, license: 'Apache 2.0', input: 0.195, output: 1.56, ctx: 262144, img: true, vid: true },
  { model: 'Gemma 4 26B A4B', provider: 'google', score: 25.7, open: true, license: 'Gemma license', input: 0.06, output: 0.33, ctx: 262144, img: true, vid: true },
  { model: 'GPT-OSS 120B', provider: 'openai', score: 23.8, open: true, license: 'Apache 2.0', input: 0.036, output: 0.18, ctx: 131072, img: false, vid: false },
  { model: 'GPT-OSS 20B', provider: 'openai', score: 14.9, open: true, license: 'Apache 2.0', input: 0.029, output: 0.14, ctx: 131072, img: false, vid: false },
];

if (rows.length !== 50) {
  throw new Error(`Expected 50 unique models, got ${rows.length}`);
}

let out = '';
out += '/**\n';
out += ' * Curated Top 50 UNIQUE AI models — one model per row.\n';
out += ' * Ranking: Artificial Analysis Intelligence Index (snapshot 2026-07-11).\n';
out += ' * Pricing/context/modalities: OpenRouter Models API (2026-07-11).\n';
out += ' * Source workbook: Top_50_UNIQUE_AI_Models_One_Model_Per_Row_July_2026.xlsx\n';
out += ' * Reasoning effort variants are folded into each model row (not separate ranks).\n';
out += ' */\n';
out += 'export const LEADERBOARD_SNAPSHOT_TS = Date.UTC(2026, 6, 11, 12, 0, 0);\n\n';
out += 'export const LEADERBOARD_SNAPSHOT_ROWS = [\n';

for (const r of rows) {
  out += '  {\n';
  out += `    model: ${JSON.stringify(r.model)},\n`;
  out += `    provider: ${JSON.stringify(r.provider)},\n`;
  out += `    arena_score: ${r.score},\n`;
  out += `    ci_low: ${r.score},\n`;
  out += `    ci_high: ${r.score},\n`;
  out += `    open_source: ${r.open},\n`;
  out += `    license: ${JSON.stringify(r.license)},\n`;
  if (r.input != null) out += `    cost_per_1m_input_usd: ${r.input},\n`;
  if (r.output != null) out += `    cost_per_1m_output_usd: ${r.output},\n`;
  if (r.ctx != null) out += `    context_window: ${r.ctx},\n`;
  out += `    supports_image: ${r.img},\n`;
  out += `    supports_video: ${r.vid},\n`;
  out += "    source: 'snapshot',\n";
  out += '    fetched_at: LEADERBOARD_SNAPSHOT_TS,\n';
  out += '  },\n';
}
out += '] as const;\n';

const dest = path.join(__dirname, '../src/features/benchmarks/leaderboardSnapshot20260711.ts');
fs.writeFileSync(dest, out, 'utf8');
console.log('Wrote', rows.length, 'rows to', dest);
