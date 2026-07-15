# Build Your Own AI / VibeModel Foundry

Build Your Own AI is VibeSpace's local-first specialist-model workflow. The first built-in project, VibeCoder, keeps raw datasets, training manifests, checkpoints, adapters, prompts, and output logs in the app's local data directory.

Dataset Studio can stage a deterministic **local synthetic variation** from a user-authored, scanned seed. It is explicitly labeled `synthetic_generator` with its local-template provenance, receives no teacher-model or network access, and still requires scan, consent, duplicate review, and immutable-version approval.

After a passing adapter is promoted, it can also draft a **local teacher target** for a reviewed seed. This is explicit opt-in, uses only the project’s promoted adapter, remains local, is source-labeled, and fills a reviewable field rather than approving or training on output automatically.

Once a version is attached, **Create next dataset version** builds `v2+` as a new immutable manifest with an explicit parent-version link. Existing training manifests stay bound to their original dataset digest; later runs opt in to the new version.

## Current execution modes

- **Fixture mode** is deterministic and local. It exercises dataset governance, job lifecycle, evaluation gates, promotion, rollback, and approved-feedback contracts without claiming to train weights.
- **Real LoRA** is opt-in. The desktop app creates an isolated Python environment, installs only hash-pinned dependencies after explicit approval, and trains a PEFT adapter from a complete checksum-verified local model snapshot and immutable JSONL dataset version.
- **QLoRA** is opt-in through the same approved isolated runtime. It is rejected unless the pinned quantization package and CUDA are verified; it never silently downgrades to another method.

## Integrity and privacy

The native layer accepts only bounded identifiers, configured model revisions, and project-scoped paths. A training job writes immutable dataset and training manifests, verifies every snapshot and dataset digest before loading a model, streams bounded worker protocol events, and supports cancellation or stop-after-checkpoint. Resume uses only a verified checkpoint.

Completed adapter artifacts include an immutable manifest with adapter-file digests, base-model digests, data digests, training configuration, and numeric validation metrics. Before an artifact is presented as ready, VibeSpace reads it through a fixed project/job path and verifies each listed adapter file again. Artifact paths that attempt to escape the adapter directory are rejected.

Supabase metadata migration `0031_model_foundry_metadata.sql` stores only owner-scoped project, dataset-version, job, model-version, evaluation, and deployment metadata. It deliberately excludes raw examples, weights, checkpoints, prompts, outputs, and logs. The in-app **Optional metadata sync** setting is off by default and respects the existing cloud-sync entitlement; when available and enabled it queues only an allowlisted summary (IDs, hashes, lifecycle state, aggregate scores, and promotion history) through the existing signed-in account sync queue. Disabling it queues a metadata tombstone; it never deletes the local project or artifacts. Applying the migration remains an environment/deployment operation and is not performed by local app code.

## Known boundaries

Verified real adapters enter the local registry as candidates. A local, deterministic reference evaluation compares a candidate against its pinned base model and, when one exists, the current champion. A user can instead supply up to 32 **private local reference cases**; these remain in the local evaluation manifest, reject credential-shaped text, and expose only scores, hidden status, and evidence hashes in the result. A candidate must pass that gate and receive explicit approval before it becomes the champion and appears in the regular chat model picker. VibeSpace rejects a candidate or stale adapter ID at inference time, then routes the promoted bounded project/job identity through the native worker, verifies the artifact again, and generates locally without a network service. Previously approved adapters remain available to re-promote as a rollback target. Fixture-mode deployment records still represent local routing intent and must not be read as a running inference server.

## Focused checks

Run from `app` / `app/src-tauri`:

```powershell
python -m py_compile src-tauri\workers\model_foundry\worker.py src-tauri\workers\model_foundry\real_training.py
cargo test --manifest-path src-tauri\Cargo.toml --lib model_foundry_training::tests
cargo test --manifest-path src-tauri\Cargo.toml --lib model_foundry_download::tests
npm run typecheck
```

The full TypeScript check can be slower than the focused native checks on an actively running desktop workspace.
