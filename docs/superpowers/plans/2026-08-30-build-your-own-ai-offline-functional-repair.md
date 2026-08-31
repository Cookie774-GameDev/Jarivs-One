# Build Your Own AI Offline Functional Repair Plan

**Goal:** Make the existing Build Your Own AI pipeline internally coherent without launching VibeSpace: preserve project identity from real training through candidate registration, ensure a verified artifact selected from the Agent editor uses the dedicated local Foundry provider rather than the OpenCode/Ollama route, automatically repair the verified worker when a weight-training method is selected, and make training device selection explicit and fail-closed.

**Architecture:** Keep the existing Rust job engine, attested Python worker, native bridge, local adapter registry, and dedicated `foundry` provider. Add only the missing project identity field to native jobs/events and a bounded native-artifact model identity for the Agent-editor shortcut. Native artifact validation remains authoritative; governed project/job adapters continue to require the existing passing evaluation and explicit promotion.

**Constraints:** No live app testing. No Chat/OpenCode/runtime-profile/RLM/Context/Jarvis behavior changes. No second workflow engine. Preserve the dirty shared worktree and all unrelated locks.

## Task 1: Preserve real-training project identity

**Files:**
- `app/src-tauri/src/model_foundry.rs`
- `app/src/features/model-foundry/nativeBridge.ts`
- `app/src/features/model-foundry/nativeBridge.trainingContract.test.ts`

1. Add a RED bridge test proving `startFoundryTraining` forwards `projectId` and a job update publishes that same ID.
2. Add an optional, backward-compatible `projectId` field to the Rust request/job schema and every derived job lifecycle path.
3. Have the bridge read `payload.projectId`; retain a bounded request-local fallback only for jobs started during the current renderer lifetime.
4. Run focused TypeScript and Rust tests.

## Task 2: Route verified Hub artifacts through Foundry

**Files:**
- `app/src/features/model-foundry/modelHub.ts`
- `app/src/features/model-foundry/modelHub.test.ts`
- `app/src/features/agents/AgentManager.tsx`
- `app/src/lib/ai/providers/foundry.ts`
- `app/src/lib/ai/providers/foundry.test.ts`

1. Add RED tests for a bounded `artifact--<jobId>` model identity and native-only provider routing.
2. Keep governed `<projectId>--<jobId>` adapters gated by the promotion registry.
3. Change the Agent editor activation callback to persist provider `foundry` and the bounded artifact model ID.
4. Ensure completed verified native jobs are offered only under the Foundry provider, never as Ollama/OpenCode models.
5. Run focused provider, model-hub, and Agent-manager tests.

## Task 3: Offline system verification

1. Run all Model Foundry frontend/provider tests.
2. Run Python worker contract tests.
3. Run Rust `model_foundry` and `model_foundry_training` tests.
4. Run TypeScript typecheck and production build; attribute unrelated dirty-worktree failures without modifying them.
5. Inspect the exact owned diff and run a static registration check for every invoked native command.
6. Record what is proven offline and explicitly identify hardware/download/GPU behaviors that cannot be truthfully proven without live execution.

## Task 4: Automatic setup and explicit training device

**Files:**
- `app/src/features/model-foundry/BuildYourOwnAIHub.tsx`
- `app/src/features/model-foundry/BuildYourOwnAIHub.test.tsx`
- `app/src/features/model-foundry/modelHub.ts`
- `app/src/features/model-foundry/modelHub.test.ts`
- `app/src/features/model-foundry/nativeBridge.ts`
- `app/src-tauri/src/model_foundry_training.rs`
- `app/src-tauri/workers/model_foundry/worker.py`
- worker request tests

1. Add RED tests for a required `gpu`/`cpu` compute device and for GPU-only fail-closed behavior.
2. Default new weight-training configurations to GPU-only; estimates must use the selected device rather than an incidental detected accelerator.
3. Thread the device through TypeScript, Rust, and the closed Python request schema.
4. Make GPU-only require CUDA before loading the model and forbid CPU fallback; CPU-only must explicitly suppress CUDA.
5. Selecting LoRA, QLoRA, or Full with a missing/incomplete worker automatically runs the existing hash-checked setup path, requesting QLoRA dependencies only for QLoRA.
6. Prove Knowledge, LoRA, QLoRA, and Full availability contracts offline.

## Task 5: Bounded D-drive GPU mini-training

1. Use a unique verified directory under `D:\` and set every model/cache/temp/output location within it.
2. Reuse the already verified smallest 135M model; do not download or create more than 5 GiB total.
3. Run the canonical worker interface with one bounded GPU-only step. If the verified CUDA runtime is unavailable, fail closed and report setup readiness rather than falling back to CPU.
4. Verify the artifact and record total bytes, hashes, device, and exit code without launching VibeSpace.
