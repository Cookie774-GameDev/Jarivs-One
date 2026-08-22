# PR31 Build Your Own AI / Model Foundry — Full Audit and Implementation Plan

Status: implementation-ready audit; product behavior is unchanged by this document

Branch audited: `integration/UnifiedChungus-final`

Audit base: `3063b84130c7f02dc09130fb472056eba88a854b`

Date: 2026-08-22

## 1. Executive verdict

The pasted audit is substantially correct, but parts of its history are stale. The current local branch is not an empty mock: it has verified model downloads, local-only enforcement, job persistence, cancellation, checkpoint recovery, artifact integrity checks, promotion/evaluation concepts, direct local inference, Dataset Studio, and a sizeable focused test suite. However, it is not yet one complete production training-to-use system.

The central problem is not a single missing button. There are two partially overlapping Foundry implementations and several disconnected control planes:

1. The active desktop path embeds `worker.py`, installs a private Python environment, installs a CPU-only PyTorch stack, accepts text JSONL, applies only method/epochs/max-steps from the rich UI, and serves promoted artifacts through a VibeSpace-only native path.
2. A newer `real_training.py`, pinned `pyproject.toml`, `uv.lock`, and hash-exported requirement locks implement a better request/configuration and evaluation design, but no production code imports or invokes that module and the native installer does not install from those locks.
3. The media module plans document/image/audio/video preparation, but no production processor executes that plan. The creation screen therefore rejects PDF/DOCX/image/audio/video sources.
4. Foundry models are usable inside VibeSpace only through a special `provider === 'foundry'` branch. They are not live OpenCode catalog routes and do not use the shared persistent OpenCode transport.

The correct repair is to preserve the good safety and artifact work, choose one canonical training/runtime implementation, add real preparation and serving services, then migrate post-training inference to OpenCode only after exact parity is proven.

## 2. Foundry versus OpenCode

These are complementary systems, not alternatives.

| System                            | Owns                                                                                                                                                                          | Must not own                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Model Foundry / Build Your Own AI | Source approval, preparation, datasets, base-model compatibility, training, checkpoints, evaluation, artifact signing/attestation, promotion, lifecycle, local server startup | General Chat/Terminal/ADE routing, cloud-provider credentials, unrelated model substitutions |
| OpenCode                          | Persistent provider sessions, live model catalog, shared inference dispatch, streaming, tool/context behavior, Terminal/ADE/Chat route consistency                            | Editing weights, preparing datasets, training jobs, artifact promotion                       |

Recommended architecture:

```text
approved sources
  -> local preparation and human review
  -> immutable Dataset Manifest
  -> capability + hardware gate
  -> weight training
  -> checkpoint + evaluation + promotion
  -> persistent loopback OpenAI-compatible Foundry server
  -> VibeSpace-managed OpenCode provider registration
  -> live OpenCode catalog confirmation
  -> Chat / Terminal / ADE through the existing shared OpenCode path
```

OpenCode's current official provider documentation supports custom OpenAI-compatible providers with an explicit local `baseURL` and model map. Therefore Foundry should expose a real endpoint and register it through the existing VibeSpace OpenCode manager, not add another permanent router exception. See <https://opencode.ai/docs/providers/> and <https://opencode.ai/docs/models>.

## 3. Audit scope and evidence

The audit read the current local implementations and tests across:

- `app/src/features/model-foundry/**`
- `app/src-tauri/src/model_foundry.rs`
- `app/src-tauri/src/model_foundry_training.rs`
- `app/src-tauri/src/model_foundry_download.rs`
- `app/src-tauri/workers/model_foundry/**`
- `app/src/lib/ai/providers/foundry.ts`
- the Foundry-specific branch in `app/src/lib/ai/router.ts`
- the relevant PR31 execution/final evidence and conflict-resolution ledgers
- the machine's read-only CPU, RAM, GPU, drive, Python, and app-data runtime state

The inventory contains 55 Foundry-related source/test/config files in the bounded scan: 34 production/config files and 21 focused test files. This is a meaningful foundation, but test names describing planned multimodal preparation do not prove an executable media pipeline exists.

## 4. Claim-by-claim truth table

| Claim from pasted audit               | Current local truth                                                                                                                                                                                                                          | Verdict                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Private runtime is absent             | App data contains `training-runtime/worker.py` and one downloaded base-model directory, but no private `python-env`. The worker hash differs from current embedded `worker.py`, so current source inspection would mark it unattested/stale. | Partly stale wording; blocker remains real |
| PR head does not install dependencies | Current local source now creates a private venv and installs packages.                                                                                                                                                                       | Outdated                                   |
| Installer is CPU-only                 | Active native installer pins `torch==2.13.0+cpu` from the PyTorch CPU index and installs Transformers/Datasets/Accelerate/PEFT separately. It does not install bitsandbytes.                                                                 | Confirmed                                  |
| QLoRA cannot be reliable as packaged  | Active worker gates QLoRA on CUDA + PEFT + bitsandbytes, but the installer supplies CPU Torch and no bitsandbytes.                                                                                                                           | Confirmed                                  |
| Windows GPU detection is broken       | Native Windows detection always returns `gpu: None`, `vramGb: 0`, and no accelerators.                                                                                                                                                       | Confirmed                                  |
| Rich training controls are dropped    | Dataset Studio's request defines seed, batch size, accumulation, max sequence, learning rate, rank, alpha, and dropout. `nativeBridge.ts` forwards only method, epochs, and optional max steps.                                              | Confirmed                                  |
| Worker hard-codes settings            | Active `worker.py` hard-codes batch 1, accumulation 4, LoRA rank 16, alpha 32, dropout 0.05, LR 2e-4/2e-5, and sequence <= 4096.                                                                                                             | Confirmed                                  |
| Validation split is used              | `FoundryNativeTrainingRequest` contains train and validation examples, but the bridge serializes only training examples; active worker has no evaluation dataset.                                                                            | Worse than the UI contract implies         |
| A better real trainer exists          | `real_training.py` validates a fuller config, checks pinned inputs, uses completion masking, saves verified adapter checkpoints, evaluates, and records config/metrics. It supports LoRA/QLoRA only.                                         | Confirmed but dead/unwired                 |
| Locked dependencies exist             | `pyproject.toml`, `uv.lock`, `requirements-real.lock`, and `requirements-qlora.lock` exist. Active installer ignores them and uses different versions.                                                                                       | Confirmed split-brain                      |
| Documents/images/audio/video work     | Current active trainer accepts one local text JSONL. PDF, DOCX, images, audio, and video are classified unsupported by the product unless future workers exist. `mediaPreparation.ts` is a planner, not an executor.                         | Not implemented                            |
| RLHF/DPO exists                       | Preference examples can be represented in Dataset Studio, and the old probe mentions `trl`, but there is no DPO/ORPO/reward/PPO/GRPO training path.                                                                                          | Not implemented                            |
| Full fine-tuning exists               | Active worker has a full method and writes a full-model artifact. The newer `real_training.py` deliberately supports only LoRA/QLoRA. Full training remains constrained by the CPU runtime and hardware gate problems.                       | Present in old path, not production-ready  |
| Foundry runs through OpenCode         | Router lines 801–838 explicitly bypass OpenCode for `provider === 'foundry'`; `foundryProvider` calls native `model_foundry_chat`.                                                                                                           | False                                      |
| Foundry models can run at all         | A promoted, currently passing Foundry artifact can run through the direct local VibeSpace provider after native metadata/integrity gates.                                                                                                    | True, but separate path                    |

## 5. Current-machine finding

Read-only machine evidence at audit time:

- CPU: AMD Ryzen 5 7235HS, 4 cores / 8 logical processors.
- RAM: 15.7 GiB.
- GPU: NVIDIA GeForce RTX 4050 Laptop GPU; `nvidia-smi` reports 6141 MiB VRAM and compute capability 8.9.
- Storage: approximately 5.2 GiB free on C: and 254.8 GiB free on D:.
- Python: system Python 3.12.10 and 3.10 are installed.
- Current Foundry runtime root is under roaming app data on C:.
- The runtime contains a stale worker and a downloaded SmolLM2 135M snapshot, but no private Python environment.

Consequences:

- C: is not a safe default for model/runtime/checkpoint growth.
- D: should be offered as the recommended managed Foundry storage root on this machine.
- The GPU is capable enough for a narrowly bounded QLoRA tier, but 6 GiB VRAM and 16 GiB RAM are not enough for the broad multimodal/full-fine-tune promise. Availability must be proven by a runtime smoke test per base model and method.
- The current VibeSpace hardware UI cannot discover this GPU, so its recommendation result is not trustworthy.

## 6. Product truth: the four current choices

The existing four cards are:

1. Knowledge/RAG — does not edit weights.
2. LoRA — edits adapter weights.
3. QLoRA — edits adapter weights while loading the base in low-bit form; requires a verified CUDA/bitsandbytes path in the current design.
4. Full fine-tuning — edits all weights and has the highest memory/storage risk.

Keep these four visible because they match the current user workflow, but group them truthfully:

```text
Add knowledge without changing weights
  Knowledge / RAG

Train model weights
  LoRA
  QLoRA
  Full fine-tuning

Advanced preference alignment (later phase)
  DPO / ORPO
```

Do not market RAG as weight training. Do not relabel LoRA as RLHF. Full RLHF with a reward model plus policy optimization is a separate, much larger feature and should not be implied by a preference-pair editor.

## 7. Target product contract

### 7.1 Invariants

- Local means local: no source, derived dataset, prompt, checkpoint, or model content leaves the machine without a separate explicit cloud authorization.
- No silent method fallback. If QLoRA fails its gate, do not run LoRA. If a trained route is offline, do not substitute a cloud or unrelated local model.
- The exact requested configuration and exact effective configuration are recorded separately.
- Every dataset, base snapshot, runtime, checkpoint, artifact, evaluation, serving route, and OpenCode catalog record is content-addressed or versioned.
- File-extension acceptance is not capability proof.
- Selecting a text-only base never promises native vision/audio/video behavior.
- OpenCode selection is enabled only after the live catalog confirms the exact connection/provider/model route.
- The legacy direct Foundry route remains available only during migration and is removed only after parity gates pass.

### 7.2 Canonical `TrainingRequestV2`

One versioned object must flow through React -> native bridge -> Rust validation -> Python worker -> artifact metadata:

```text
TrainingRequestV2
  requestId / projectId / jobId / schemaVersion
  baseModelSnapshot { id, revision, file digests, architecture, processor }
  method { rag | lora | qlora | full | dpo | orpo }
  datasetManifest { id, train, validation, preference, digests, token counts }
  config {
    epochs, maxSteps, batchSize, gradientAccumulation,
    learningRate, maxSequenceLength, precision,
    optimizer, scheduler, warmup, weightDecay, seed,
    checkpointPolicy, evaluationPolicy
  }
  adapter { rank, alpha, dropout, targetModules }
  hardwarePolicy { device, maxVram, cpuOffload, stopOnThermalOrDiskPressure }
  privacy { localOnly, telemetryAllowed }
```

Rust must reject unknown fields, unsafe paths, incompatible method/base/modality pairs, unapproved datasets, impossible bounds, stale digests, and insufficient storage before spawning a worker. The artifact manifest must persist request digest, requested config, effective config, dependency/runtime versions, hardware used, base/dataset digests, checkpoints, metrics, and exit state.

## 8. Media and file support

### 8.1 Two honest modes

For a text base model, media is converted to reviewed text examples:

| Input                  | First production path                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| TXT/MD/code            | Decode, normalize, chunk, dedupe, review                                                          |
| JSON/JSONL/CSV/Parquet | Schema map, validate, dedupe, split, review                                                       |
| PDF/DOCX               | Local text/table extraction; OCR only when necessary; preserve page/source anchors                |
| Image                  | Local OCR plus caption/annotation; user reviews derived text                                      |
| Audio/MP3/WAV/M4A/FLAC | Local transcription, diarization/time anchors where supported, review                             |
| Video/MP4/MOV/WebM/MKV | Inspect container, bounded frames, audio extraction/transcription, OCR/caption, alignment, review |

For a genuine multimodal base, the model manifest must identify the exact processor and supported input schema. Images/audio/video become model-specific tensors/tokens through an architecture-specific trainer. Converting media to text teaches extracted information; it does not grant a text LLM native sight, hearing, or video understanding.

### 8.2 Preparation service

Implement a separate attested local preparation service rather than expanding `worker.py` into an unmaintainable monolith:

- `DocumentProcessor`
- `StructuredDataProcessor`
- `CodeProcessor`
- `ImageProcessor`
- `AudioProcessor`
- `VideoProcessor`

Each processor emits immutable derived assets plus a versioned `DatasetManifest` containing original digest/path grant, processor/version, derived-item digests, modality, timestamps/page/frame anchors, prompt/answer/caption/transcript, review state, license/provenance, privacy classification, and train/validation/test split.

Required controls:

- C:/D: picker grants through existing native authorization boundaries.
- Directory ingestion with preview, include/exclude rules, resumable hashing, dedupe, cancellation, and bounded concurrency.
- Explicit review before training; quarantined secrets/PII do not enter a dataset until resolved.
- Originals remain unchanged; derived media and annotations are copies.
- Large files stream to disk; they are never loaded wholly into React memory.
- Processor failure preserves already verified work and reports the exact file/stage.

### 8.3 Multimodal base manifests

Extend the pinned model catalog with declared, verified capabilities rather than model-name inference:

```text
architecture
processorClass + pinned processor files
inputModalities / outputModalities
supportedTrainingMethods
supportedPrecisions
maxSequence / image size / audio duration / frame policy
chat template
license + gated status
runtime profile
minimum and recommended compute
all file digests
```

Start with one proven text base and one proven vision-language base. Add audio and video only after their model-specific train-and-serve acceptance suites are real.

## 9. Runtime and hardware repair

### 9.1 Remove the split-brain runtime

- Choose the newer manifest-driven trainer as the canonical implementation.
- Wire it through the embedded worker entrypoint or make it the signed entrypoint itself.
- Generate installation manifests from the checked-in hash-pinned lockfiles.
- Delete conflicting hand-maintained dependency constants only after migration tests prove the new installer.
- Do not install or mutate global Python, pip, PATH, CUDA, or the user's unrelated environments.

Profiles:

- CPU inference/training profile: pinned CPU Torch; LoRA/full only when measured practical.
- NVIDIA CUDA profile: pinned compatible Torch/CUDA wheels; PEFT; optional bitsandbytes for QLoRA.
- Future platform profiles must fail closed until separately tested.

The installer must download to staging, verify every wheel/package manifest, build the private environment, run import and tensor smoke tests, atomically promote it, and retain the prior known-good runtime for rollback.

### 9.2 Movable storage

Create one setting for the managed Foundry root, defaulted by a capacity advisor rather than blindly to C:. Suggested layout:

```text
D:\VibeSpace-Model-Foundry\
  runtime\
  models\
  sources\
  datasets\
  jobs\
  checkpoints\
  artifacts\
  serving\
  logs\
```

Migration must canonicalize source/destination, reject unsafe roots/symlinks, calculate required temporary space, copy with digest verification, switch authority atomically, retain rollback metadata, and delete the old copy only after explicit confirmation.

### 9.3 Real hardware probe

Use two layers:

1. Native OS inventory: CPU model/cores, total/available RAM, GPU adapters, total/free VRAM, driver, disk volume and free bytes, power/thermal state where reliable.
2. Exact private-runtime probe: Torch version, CUDA runtime, `torch.cuda.is_available`, device name/capability, bf16/fp16 support, bitsandbytes import, 4-bit quantization smoke, processor imports, and a tiny allocation/forward-pass test.

WMI alone is insufficient; this machine demonstrates why. QLoRA becomes selectable only when the exact runtime smoke test succeeds.

### 9.4 Recommendation and duration estimate

Static model heuristics are allowed only as a conservative pre-filter. Before Train, run a bounded warm-up on the selected model/config and measure tokens/sec plus peak allocated/reserved memory. Estimate:

```text
effective steps = ceil(train tokens / effective batch tokens) * epochs
duration range = effective tokens / measured warm throughput + eval/checkpoint overhead
disk = base + runtime + datasets + checkpoints + final artifact + rollback reserve
```

Show assumptions and a range. Recompute when method, model, sequence length, batch, accumulation, epochs, dataset, or device changes.

For the audited machine, the first honest recommendation is small text LoRA or carefully proven 4-bit QLoRA with storage on D:. Full fine-tuning and heavyweight multimodal training should remain unavailable unless a model-specific probe proves otherwise.

## 10. Training, evaluation, and preference alignment

### Phase-supported methods

| Method           | Near-term implementation                                                                           | Gate                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Knowledge/RAG    | Preserve current separate knowledge artifact path, then upgrade retrieval/evaluation independently | Approved source and retrieval eval                       |
| LoRA             | Canonical manifest-driven trainer                                                                  | Base/runtime fit and train/eval smoke                    |
| QLoRA            | Same trainer plus verified 4-bit CUDA profile                                                      | CUDA + bitsandbytes + micro-smoke                        |
| Full fine-tuning | Dedicated full-weight trainer and artifact type; do not route through PEFT-only code               | Strong memory/disk/time gate                             |
| DPO/ORPO         | Later preference trainer using approved chosen/rejected pairs                                      | TRL/runtime profile and preference eval                  |
| PPO/GRPO RLHF    | Separate future program                                                                            | Reward model, rollout infrastructure, safety/cost design |

Required training behavior:

- deterministic seeds and requested/effective config disclosure;
- immutable train/validation/test splits;
- completion-only masking and architecture-specific chat templates;
- periodic atomic checkpoints with safe resume fingerprint;
- cancel immediately or stop-after-checkpoint options;
- disk/thermal/OOM monitoring with structured recovery advice;
- no overwrite of an existing artifact;
- base-vs-candidate and champion-vs-candidate evaluation;
- safety cases, task metrics, latency, memory, and qualitative sampled output review;
- explicit promotion and reversible rollback.

The existing similarity-based evaluation is useful scaffolding, not sufficient proof of model quality. Add task-appropriate metrics and hidden human-reviewed cases.

## 11. Persistent serving and OpenCode handoff

### 11.1 Foundry serving service

After promotion, launch one supervised loopback-only service that loads the exact verified base plus adapter, or the verified full-model artifact. It must expose at minimum:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- server-sent streaming compatible with the selected OpenCode provider package
- cancellation and bounded request queues
- exact model/capability/context/output metadata

Bind to `127.0.0.1`, use an ephemeral per-profile authorization token held through the existing native secret boundary, reject non-loopback access, supervise lifecycle, and never serve an unpromoted or digest-mismatched artifact.

### 11.2 Managed OpenCode provider

Register one VibeSpace-managed provider, for example `vibespace-foundry-local`, through the existing persistent OpenCode configuration/runtime manager. Each promoted artifact is a distinct exact model ID, not a lossy display label.

Required route identity:

```text
providerId + modelId + connectionId + endpoint instance + artifact digest + base digest
```

Activation sequence:

1. Verify artifact and evaluation remain current.
2. Start the serving service.
3. Verify `/health` and `/v1/models` exact identity.
4. Update managed OpenCode configuration atomically.
5. Trigger the existing forced, single-flight catalog refresh.
6. Wait for the live catalog to expose the exact route and capabilities.
7. Enable selection in every shared model picker.
8. Send canary chat/stream requests through OpenCode and compare with the direct path.

### 11.3 Safe migration

- Keep direct Foundry inference behind a migration flag while building the server.
- Run exact output/identity, streaming, cancellation, context, tools, Terminal, ADE, and Chat parity tests.
- Never fall back from the selected trained model to another route.
- After two release cycles with parity evidence, remove `runFoundryDispatch` and the separate `foundryProvider` execution path. Keep Foundry as the training/control plane.

## 12. User experience

Recommended flow:

1. **Goal** — what the model should do; explain RAG vs weight training.
2. **Data** — files/directories; local-only disclosure; scan/preparation status.
3. **Review dataset** — source anchors, derived content, duplicates, secrets/PII, licenses, splits.
4. **Choose base** — only compatible text/vision/audio/video models; exact license and download size.
5. **Choose method** — RAG/LoRA/QLoRA/Full with measured availability reasons.
6. **Configure** — Basic presets plus Advanced exact values; no control that is ignored.
7. **Compute check** — live GPU/RAM/VRAM/storage/runtime, warm-up, duration range, expected quality/risk.
8. **Confirm** — immutable request summary and user approval.
9. **Train** — stage/progress/log summary, pause-at-checkpoint, cancel, recovery.
10. **Evaluate** — base/candidate/champion evidence and sampled outputs.
11. **Promote** — explicit action.
12. **Use through OpenCode** — show exact ready connection and open Chat/Terminal/ADE.

Every unavailable option stays visible with a concrete reason and recovery action. A red/amber state must not be presented as “Best for your PC.”

## 13. Implementation phases and likely file ownership

Because this is a shared branch, each phase must claim exact paths immediately before edits and must re-read active locks. The manifests below are likely scope, not advance ownership.

### Phase 0 — Freeze contracts and add failing tests

- Add `TrainingRequestV2`, dataset/base/artifact/runtime/route schemas.
- Add source-contract tests proving all settings survive TS -> Rust -> Python -> artifact.
- Add tests proving `real_training.py` is currently unwired and direct Foundry bypass exists.
- Produce one frozen fixture with exact hashes.

Likely areas: new Foundry contract modules/tests; bounded additions to `nativeBridge.ts`, Rust Foundry modules, and worker tests.

### Phase 1 — Canonical managed runtime and storage

- Wire the manifest-driven trainer.
- Install from reviewed hash-pinned profiles.
- Add atomic runtime upgrades/rollback.
- Add configurable C:/D: managed root and safe migration.
- Repair stale existing runtime detection/migration.

Acceptance: fresh install and upgrade work without global Python/PATH mutation; exact runtime probe reports truth; interrupted install retains prior runtime.

### Phase 2 — Hardware advisor and honest four-choice UI

- Implement native plus runtime hardware probes.
- Add model/method compatibility service and warm-up estimator.
- Make every current displayed control effective or remove it.
- Group RAG separately from weight editing.

Acceptance: audited RTX 4050 is detected with truthful VRAM; QLoRA stays disabled until its smoke passes; C:/D: recommendation reflects selected storage root.

### Phase 3 — Text/data/document preparation

- Implement streamed text/code/structured/document processors.
- Wire picker, directory intake, review, immutable manifests, lineage, and split generation.
- Use the full validation split in training/evaluation.

Acceptance: TXT/MD/code/JSONL/CSV and selected PDF/DOCX fixtures produce reviewed, source-anchored, reproducible examples; secrets and unsafe paths fail closed.

### Phase 4 — Image/audio/video preparation

- Add attested image, transcription, and FFmpeg-backed processors.
- Start with text-conversion mode.
- Add one model-specific vision pipeline only after capability manifest and training/serving proof.
- Add native audio/video training architectures in later subphases, not via generic flags.

Acceptance: MP3/MP4/PNG fixtures produce reviewable derived datasets; cancellation/resume, large-file streaming, provenance, and no-upload guarantees are proven.

### Phase 5 — Complete weight training

- LoRA and QLoRA through canonical trainer.
- Dedicated full-weight implementation with its own artifact schema.
- Stronger evaluation/promotion gates.
- DPO/ORPO only after preference dataset and runtime contracts are accepted.

Acceptance: tiny deterministic models complete end-to-end; requested/effective config and dataset/base hashes match artifacts; tampering, OOM, disk pressure, cancellation, and resume behave safely.

### Phase 6 — Serving and OpenCode migration

- Build the supervised loopback server.
- Add managed OpenCode provider registration and live catalog confirmation.
- Reuse the shared model picker and exact route identity.
- Prove Chat/Terminal/ADE parity and remove the direct bypass only after the migration gate.

Acceptance: promoted model appears from the live OpenCode catalog, streams and cancels through the persistent OpenCode path, works in all three surfaces, and fails closed when stopped.

### Phase 7 — Preference alignment and broader multimodality

- DPO/ORPO, then separately scoped RLHF research.
- Additional verified vision/audio/video architectures.
- Optional cloud training is out of scope unless separately authorized with explicit privacy, cost, and billing controls.

## 14. Required automated tests

### Contracts and runtime

- every `TrainingRequestV2` field reaches effective worker config;
- unknown/missing/out-of-range fields fail closed;
- locked runtime install, upgrade, corruption, rollback, and offline states;
- CPU/CUDA/bitsandbytes probe truth and QLoRA smoke;
- storage-root traversal/symlink/reparse-point, capacity, migration, interruption, and digest tests;
- requested/effective config and dependency versions in artifact metadata.

### Data and media

- file/directory picker authorization and canonical containment;
- streamed large-file hashing/intake; duplicate and resume behavior;
- TXT/MD/code/JSONL/CSV/PDF/DOCX fixtures;
- PNG/JPEG/MP3/WAV/MP4/MOV fixtures and malformed/oversized/encrypted variants;
- source anchors, processor versions, derived hashes, review, license, PII/secrets;
- text-conversion versus native-modality capability gates;
- exact train/validation/test split usage and no hidden-set leakage.

### Training and evaluation

- LoRA, QLoRA, full, cancel, stop-after-checkpoint, resume, OOM, disk pressure;
- prompt masking, chat template, sequence truncation, batch/accumulation math;
- deterministic tiny-model artifact hashes where feasible;
- base/candidate/champion evaluation and promotion/rollback;
- DPO/ORPO chosen/rejected mapping when implemented;
- no cloud/network access during local train/inference.

### Serving and OpenCode

- `/health`, `/v1/models`, non-stream and SSE chat, cancellation, queue bounds;
- loopback-only binding and per-profile authentication;
- exact provider/model/connection/artifact identity;
- forced catalog refresh and same-model/different-artifact distinction;
- Chat, Terminal, and ADE use the same live route;
- stopped/tampered/unpromoted model is unavailable with no substitution;
- legacy direct route parity followed by removal test.

## 15. Native acceptance matrix

Manual/product acceptance must use the official native Tauri VibeSpace app. Playwright may attach only to that running native WebView; a standalone browser is not product proof.

Required scenarios:

- choose/migrate Foundry storage from C: to D: and restart;
- install/repair private runtime and verify global Python/PATH remain unchanged;
- detect the actual CPU/RAM/RTX 4050/VRAM/storage values within documented tolerance;
- ingest a mixed fixture folder containing text, code, PDF, image, MP3, MP4, malformed files, duplicates, and secret-like content;
- inspect and approve derived examples;
- complete small LoRA and, only if smoke-qualified, QLoRA jobs;
- cancel and resume from a verified checkpoint;
- evaluate, promote, and start serving;
- confirm the exact trained model appears in the shared live OpenCode picker;
- send/stream/cancel in Chat, Terminal, and ADE;
- stop the local server and confirm truthful offline behavior with no cross-provider fallback;
- restart VibeSpace and confirm storage, artifacts, promotion, server, and route identity recover safely.

Do not claim full multimodal acceptance from media preprocessing alone. Native image/audio/video weight training requires a compatible base/processor and architecture-specific end-to-end proof.

## 16. Security, privacy, and licensing

- Continue rejecting remote-code model snapshots by default.
- Pin revisions and SHA-256 for every model/processor/runtime file.
- Treat imported datasets/media and model metadata as untrusted data.
- Maintain canonical-path and reparse-point protections at every native boundary.
- Bind inference only to loopback; use ephemeral auth; redact prompts and secrets from ordinary logs.
- Require explicit model and dataset license acceptance and preserve provenance in artifacts.
- Never bundle or download a model whose license/use constraints are not represented truthfully.
- Keep optional metadata sync content-free; never sync dataset/model contents without separate authorization.
- Cloud training, billing, Supabase, Stripe, and production deployment are not authorized by this plan.

## 17. Release gates and definition of done

Build Your Own AI is complete only when all of these are true:

- one canonical, pinned, self-contained runtime is installed and rollback-safe;
- storage can safely live on an authorized C:/D: root;
- actual GPU/VRAM/runtime capability is detected and smoke-tested;
- every displayed training setting is either effective and recorded or absent;
- RAG is clearly distinguished from weight editing;
- LoRA, QLoRA, and full training each pass their exact capability gates and end-to-end tiny-model tests;
- media files are executed through real processors with human-reviewable, reproducible manifests;
- native multimodal claims exist only for proven architecture-specific paths;
- evaluation/promotion/rollback is evidence-based;
- promoted models are served by a supervised local OpenAI-compatible endpoint;
- the exact trained route is confirmed by the live OpenCode catalog;
- Chat, Terminal, and ADE all use that same OpenCode route;
- no silent model, provider, method, modality, or hardware fallback exists;
- current-source native acceptance passes on supported hardware;
- required repository CI checks and focused Foundry matrices pass at the exact release commit.

## 18. Recommended immediate execution order

1. Freeze `TrainingRequestV2` and add source-contract failures for every currently dropped field and validation split.
2. Wire and reconcile the newer manifest-driven trainer; remove dependency/version split-brain.
3. Implement movable storage before downloading more models on this machine.
4. Replace fake Windows GPU reporting with native + private-runtime probes.
5. Prove small text LoRA, then 6 GiB-safe QLoRA if its exact smoke passes.
6. Build text/structured/document preparation and review.
7. Build image/audio/video text-conversion processors.
8. Build the persistent loopback serving service and OpenCode registration.
9. Prove Chat/Terminal/ADE parity, then retire direct Foundry dispatch.
10. Add model-specific native vision, audio, and video trainers incrementally.
11. Add DPO/ORPO only after preference datasets and evaluation gates are mature.

This order turns the current collection of real but disconnected pieces into one trustworthy pipeline without discarding working safety, artifact, and recovery code.
