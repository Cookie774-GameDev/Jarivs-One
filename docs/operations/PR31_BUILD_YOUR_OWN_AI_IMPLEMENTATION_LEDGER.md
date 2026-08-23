# PR31 Build Your Own AI Implementation Ledger

## 2026-08-22 — Full implementation authorization and Phase 0/1 claim

- Agent/task: `VS-CODEX-ROOT-FOUNDRY-IMPLEMENTATION-20260822` / `PR31-BUILD-YOUR-OWN-AI-FULL-IMPLEMENTATION`.
- Branch/base: `integration/UnifiedChungus-final` at `3063b84130c7f02dc09130fb472056eba88a854b`; upstream `origin/UnifiedChungus`.
- User authorized executing the complete implementation plan without questions. The user explicitly prohibited Computer Use and controlling the running app and deferred live manual testing; native manual acceptance will be recorded pending, never fabricated.
- Phase 0/1 exact scope is recorded in the matching agent-scoped lock. All claimed product files were clean at claim time and no active lock named them. Shared OpenCode/router/catalog/runtime paths remain excluded until re-audited for a later slice.
- Repository-wide pre-existing dirty/untracked files remain preserved. No reset, clean, stash, rebase, branch switch, production mutation, credential access, or unrelated staging is permitted.
- First objective: replace the split training contract/runtime with one versioned request that preserves validation data and every supported setting through TypeScript, Rust, Python, and artifact evidence.

## 2026-08-22T16:57:31-05:00 — Phase 0–2 canonical contract/runtime/hardware verified

- Branch/current shared HEAD: `integration/UnifiedChungus-final` / `537207aa1c3b88355249f42e83261429c79d81d2`. The shared HEAD advanced independently; this agent performed no branch operation.
- Exact product scope remained the claimed Model Foundry UI/bridge/model files, Rust Foundry runtime/training files, private worker, focused tests, and this ledger. Shared Chat/OpenCode/router/catalog files remain excluded under other active ownership.
- Implemented a closed schema-v2 training request with a distinct validation dataset. Exact seed, epochs/steps, batch, accumulation, sequence length, learning rate, LoRA settings, and target modules now survive TypeScript → Rust → Python. Local-path JSONL training creates a deterministic private train/validation split. Worker artifacts record requested/effective configuration, train/validation digests, target modules, precision, and evaluation metrics.
- Replaced the ad-hoc runtime install list with the checked-in hash-locked profiles. QLoRA availability now requires a real CUDA/bitsandbytes quantize/dequantize smoke. Hardware detection now reads NVIDIA GPU/VRAM evidence through `nvidia-smi` when available and exposes the managed storage location plus a truthful higher-capacity D: recommendation without moving user data.
- Owned tracked diff at checkpoint: 8 files, 803 insertions, 139 deletions, plus new focused TypeScript/Python tests and the implementation/audit documents.
- Verification: Model Foundry Vitest matrix `29/29` passed; worker Pytest matrix `14/14` passed; exact deterministic validation-split Rust test `1/1` passed; earlier exact Rust runtime/config tests `2/2`, NVIDIA parser `1/1`, and `cargo check --lib` passed. Existing React/Radix asynchronous `act(...)` warnings were emitted, but no test failed.
- Manual/native state: deliberately not run. The user deferred manual testing and prohibited app control for this task.
- Next: implement the next non-overlapping source-preparation slice after a fresh ownership check. Movable-storage commands and shared OpenCode integration remain outside this slice while their integration files have active external ownership.

## 2026-08-22T17:08:00-05:00 — Phase 3 bounded text/structured/DOCX preparation

- Added executable local preparation for TXT, Markdown, code, JSON, JSONL, CSV, and DOCX knowledge sources. CSV quoted fields and consistent row shape are validated; JSON/JSONL are parsed and canonicalized; DOCX is read from its bounded `word/document.xml` body without modifying the original.
- New artifacts carry source filename, format, byte count, original SHA-256, prepared-text SHA-256, per-source chunk count, and line anchors. High-confidence API credential/private-key patterns are quarantined before artifact creation.
- PDF remains explicitly unsupported until a packaged, attested extractor exists. Image/audio/video remain explicitly unsupported until the corresponding verified local processors exist; no planner-only capability is presented as executable support.
- Verification: all `model_foundry::tests` passed `19/19`; focused UI/model tests passed `22/22`; `cargo check --lib` passed with existing warnings; focused Python tests remained `14/14`; scoped diff check and Gitleaks passed. Repository-wide TypeScript typecheck is blocked by four pre-existing errors in actively owned SiYuan test files (`siyuanRlmProduction.test.ts` and `siyuanRlmRepository.test.ts`); no Foundry type error was reported and those locked files were not touched.

## 2026-08-22T17:13:00-05:00 — Phase 4 bounded installed-model transcription path

- The creation UI now queries the existing native faster-whisper status and exposes audio or video-audio transcription for knowledge extraction only when the local base speech-model assets report ready. The exact source route remains distinct: audio becomes a transcript; video contributes only its audio-track transcript, with frames explicitly excluded.
- Native preparation accepts bounded WAV/MP3/M4A/FLAC and MP4/MOV/WebM/MKV files only through that local transcription path, then applies the same secret quarantine, provenance hashes, chunk anchors, deduplication, and immutable artifact validation as document/text sources. Weight training and native vision/audio/video claims remain unavailable.
- A test-run lifecycle failure showed the readiness promise updating state after dialog teardown. Root cause was a missing cancellation guard on the new asynchronous status branch; the same run reproduced six unhandled rejections. The guarded implementation reran cleanly: focused UI/model tests `22/22`, zero unhandled errors; Rust Foundry tests `19/19`.

## 2026-08-22T17:21:00-05:00 — Phase 5 explicit configuration and native resource preflight

- Weight-training users can now review and edit the exact seed, epochs, optional maximum steps, batch size, gradient accumulation, maximum sequence length, learning rate, and (for LoRA/QLoRA) rank/alpha/dropout. Empty or unsafe values remain visible with a focused validation message and cannot begin processing; no silent clamp or worker default is used.
- Native startup independently derives conservative per-method requirements from the verified base-model parameter count and fails before creating a job when managed storage, RAM/VRAM, or QLoRA CUDA VRAM is insufficient. This mirrors the UI advisor while protecting direct command callers.
- Verification: focused Model Foundry UI/contract matrix `25/25` passed; all Rust Foundry tests `20/20` passed; exact configuration and native resource-preflight tests passed. A test-only unsupported Chai matcher and a controlled-input NaN warning were diagnosed at their sources and corrected; the rerun passed `7/7` with no NaN warning. Existing Radix asynchronous `act(...)` warnings remain pre-existing test-harness noise.

## 2026-08-22T17:22:00-05:00 — Owned-scope release checkpoint

- Product commits: `7d7ccb88` (canonical training contract/runtime plus reproducible text/structured/DOCX preparation), `e188960f` (gated installed-model audio and video-audio transcription), and `e82bc53e` (exact editable training controls plus native resource preflight).
- No Computer Use, browser automation, or running-app control was used. Native manual acceptance is pending by explicit user instruction.
- Remaining external integration blockers: `app/src-tauri/src/lib.rs` is actively owned by the SiYuan inbound-backlink slice, so movable-storage command registration cannot be safely added; `app/src/lib/ai/router.ts` and the persistent OpenCode adapter/catalog surfaces are actively owned by native acceptance/model-catalog slices, so the special Foundry route cannot yet be replaced by a live confirmed managed OpenCode route.
- Remaining product work after those scopes release: user-authorized C:/D: storage selection and crash-safe migration; packaged/attested PDF and frame/image preparation; large-media streaming rather than the current bounded transcription path; persistent loopback serving plus live OpenCode catalog confirmation; native vision/audio/video architecture-specific trainers; real tiny-model, interruption/OOM/disk-pressure, and official native end-to-end acceptance.
- Owned scope is released cleanly at HEAD `e82bc53e`; unrelated dirty files and all other agents' locks remain untouched.

## 2026-08-22T17:28:13-05:00 — Drive, presets, catalog, and onboarding expansion claim

- Agent/task: `VS-CODEX-ROOT-FOUNDRY-EXPANSION-20260822` / `PR31-FOUNDRY-DRIVES-PRESETS-CATALOG-ONBOARDING` at shared HEAD `5440e986fa9376c3afe49f14cdc3ef89b7ed28f9`.
- Re-read repository authority, live owner/locks, relevant coordination history, the full Foundry implementation plan, branch/upstream/operation state, and verified every claimed file was clean. No sub-agent, app control, production service mutation, credential access, reset, clean, stash, rebase, or branch switch is authorized.
- Root-cause evidence for “only Knowledge is available”: the dedicated Foundry page inspects and passes `trainingWorker`, but the Agents entry point mounts `BuildYourOwnAIHub` without that prop; the Hub currently converts omission into `null`, making all weight methods fail their runtime-capability gate. The repair will make the reusable Hub resolve the same native attested capability when its caller does not provide one, with a focused red/green regression.
- Exact scope is recorded in the matching agent lock. `app/src-tauri/src/lib.rs` remains actively owned by the SiYuan typed-inbound-backlinks slice and is explicitly excluded; selectable-storage command registration will not overlap that ownership.
- Scope was extended to the clean dedicated Foundry page and focused test after rechecking live locks. The runtime setup currently omits `includeQlora`, so it can install a valid LoRA/Full worker while leaving QLoRA unavailable without ever offering its verified CUDA/bitsandbytes setup path. The repair will request QLoRA explicitly and then re-inspect the base worker if that optional accelerator layer cannot attest.

## 2026-08-22T20:49:46-05:00 — Drive, presets, catalog, and onboarding expansion verification

- Agent/task: `VS-CODEX-ROOT-FOUNDRY-EXPANSION-20260822` / `PR31-FOUNDRY-DRIVES-PRESETS-CATALOG-ONBOARDING`. The shared branch advanced independently from base `5440e986fa9376c3afe49f14cdc3ef89b7ed28f9` to `326f08ed7623ea33de6269f3fa0ce15b16592905`; no intervening commit touched this exact owned scope.
- Repaired the reusable Hub's missing-worker path, which was the concrete reason Agents showed only Knowledge training. The Hub now inspects the same attested native worker as the dedicated page, and setup explicitly requests QLoRA while preserving verified LoRA/Full capability if the optional CUDA layer cannot attest.
- Added real low-memory, balanced, and faster profiles, exact advanced settings, hardware-based planning estimates, a six-step nontechnical guide, and explicit truth that MP3/MP4 currently contribute local speech transcripts rather than native audio/video weight training.
- Expanded the trainable catalog from five to eight revision-pinned, hash-complete Apache-2.0 text checkpoints, including Qwen 2.5 Coder 0.5B/1.5B and Qwen 2.5 Math 1.5B. No unsupported multimodal checkpoint or Qwen Research-licensed checkpoint was relabeled as available.
- Added user-selected C:/D: managed Foundry storage through the already-registered install/download/repair commands. Native validation rejects relative, UNC, linked, junction, reparse, nested-current, foreign non-empty, busy, or capacity-insufficient targets; migration copies and SHA-256 verifies every bounded file before atomically switching the small app-data pointer, and retains the old copy for recovery. Ollama-managed knowledge-model storage remains explicitly separate.
- Corrected the nominal 6 GB RTX 4050 edge: 6141 MiB reports as 5.997 GiB, so UI and native preflight use the same narrow 0.01 GB measurement tolerance while 5.9 GB remains rejected.
- Verification: focused Model Foundry Vitest `39/39`; Rust Foundry matrix `44/44`; Python worker Pytest `14/14`; `cargo check` passed with existing dead-code warnings; release-manifest tests `3/3`; exact scoped `git diff --check` passed. Repository typecheck remains blocked only by five unrelated errors in actively edited SiYuan/cloud-recovery tests (`siyuanRlmProduction.test.ts`, `siyuanRlmRepository.test.ts`, and `cloudRecovery.test.ts`); no Model Foundry error was reported, and the production build was not rerun because its first step is that same failing typecheck.
- Native/manual acceptance remains pending by the user's explicit instruction not to control the running app during this task. No Supabase, Cloudflare, billing, production service, credentials, running-app state, or unrelated agent file was mutated.

## 2026-08-22T20:51:00-05:00 — Expansion product commit and scope release

- Product commit: `1bbf5cf6` (`feat(foundry): add drive-aware training profiles`), containing exactly the 12 claimed tracked Model Foundry source/test/catalog/ledger files. Exact staging, staged diff check, and staged Gitleaks passed; no unrelated dirty file was staged.
- Agent-scoped ownership is released after this receipt. Native manual testing, true multimodal architecture-specific trainers, persistent live OpenCode serving/catalog confirmation, packaged PDF/image/video-frame extraction, and large-media streaming remain explicitly unclaimed rather than inferred complete.

## 2026-08-22T20:54:00-05:00 — Packaged local PDF preparation claim

- Agent/task: `VS-CODEX-ROOT-FOUNDRY-PDF-20260822` / `PR31-FOUNDRY-PACKAGED-PDF-PREPARATION` at `4c102d2b77ec45325cbe19d47ae4963c4f0aa1bb`.
- Exact clean scope: native Cargo manifest/lock, `model_foundry.rs`, renderer source classification and its focused test, this ledger, and the matching agent lock. Active `lib.rs`, OpenCode/router/catalog, Chat, and every unrelated agent path remain excluded.
- Official docs.rs crate source confirms `pdf-extract` 0.12.0 is MIT licensed and exposes in-memory per-page extraction. The bounded implementation will package it into VibeSpace, preserve page labels in prepared text, quarantine secret patterns, reject malformed/encrypted/image-only PDFs honestly, and perform no OCR, cloud call, or native-vision claim.
- Dependency metadata reports `lopdf` 0.42.0, the parser under `pdf-extract` 0.12.0, requires Rust 1.85. The native manifest minimum is therefore advanced from 1.78 to 1.85 rather than publishing an unbuildable minimum; the checked toolchain is Rust 1.96.0.
- Scope extends to the clean Hub source/focused test solely to show packaged PDF/DOCX support and the scanned-PDF OCR boundary in onboarding; no layout or unrelated flow is included.

## 2026-08-22T21:06:59-05:00 — Packaged local PDF preparation verified

- The native source allowlist and renderer now accept PDF as a locally packaged text source. `pdf-extract` 0.12.0 extracts in memory per page; prepared text carries explicit `PDF page N` provenance, a 32 MB extracted-text ceiling, existing source/prepared SHA-256 manifests, chunk deduplication, and the same high-confidence credential quarantine as every other document path.
- Malformed, encrypted, unsupported, scanned, and image-only PDFs fail closed. The user-facing explanation says local OCR is not installed and does not imply vision, OCR, upload, native multimodal understanding, or weight-training capability.
- Parser dependency truth: `pdf-extract` is pinned at 0.12.0 and `lopdf` is directly pinned at 0.42.0 because the Tauri Cargo lock is intentionally ignored. Dependency metadata reports only permissive licenses in the parser subtree and a Rust 1.85 minimum, so the native manifest now truthfully requires Rust 1.85. Verification used Rust 1.96.0. `cargo-audit` is not installed on this machine, so no RustSec-scan claim is made.
- Verification: packaged PDF extraction/malformed/credential fixture passed; the final renderer matrix passed `38/38` (`35/35` document/UI tests plus `3/3` Foundry runtime tests); native Foundry matrix passed `45/45`; `cargo check` and repeated `cargo check --locked` passed with existing dead-code warnings; formatting and scoped diff check passed. Repository typecheck remains blocked only by four unrelated active SiYuan test errors, with no Foundry error reported.
- The shared branch advanced independently during the slice; no intervening commit touched the exact claimed paths. Native/manual app control remains intentionally deferred by user instruction.

## 2026-08-22T21:10:36-05:00 — Packaged local PDF preparation released

- Product commit: `3df01186498cb4d5b0a58aa75602ee6db864a1b5` (`feat(foundry): add packaged local PDF extraction`), containing exactly the seven claimed tracked manifest, native Foundry, renderer, focused-test, and ledger files. Exact staging, staged diff check, and staged Gitleaks passed with no findings; no unrelated dirty file was staged.
- Agent-scoped PDF ownership is released after this receipt. OCR for scanned/image-only PDFs, verified image/video-frame preparation, native audio/video model training or generation, persistent live OpenCode serving/catalog confirmation, and user-deferred native manual acceptance remain explicitly incomplete.
