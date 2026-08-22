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
