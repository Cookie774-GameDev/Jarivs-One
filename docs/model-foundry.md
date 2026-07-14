# Build Your Own AI / VibeModel Foundry

Build Your Own AI is VibeSpace's local-first specialist-model workflow. The first built-in project, VibeCoder, keeps raw datasets, training manifests, checkpoints, adapters, prompts, and output logs in the app's local data directory.

## Current execution modes

- **Fixture mode** is deterministic and local. It exercises dataset governance, job lifecycle, evaluation gates, promotion, rollback, and approved-feedback contracts without claiming to train weights.
- **Real LoRA** is opt-in. The desktop app creates an isolated Python environment, installs only hash-pinned dependencies after explicit approval, and trains a PEFT adapter from a complete checksum-verified local model snapshot and immutable JSONL dataset version.
- **QLoRA** is opt-in through the same approved isolated runtime. It is rejected unless the pinned quantization package and CUDA are verified; it never silently downgrades to another method.

## Integrity and privacy

The native layer accepts only bounded identifiers, configured model revisions, and project-scoped paths. A training job writes immutable dataset and training manifests, verifies every snapshot and dataset digest before loading a model, streams bounded worker protocol events, and supports cancellation or stop-after-checkpoint. Resume uses only a verified checkpoint.

Completed adapter artifacts include an immutable manifest with adapter-file digests, base-model digests, data digests, training configuration, and numeric validation metrics. Before an artifact is presented as ready, VibeSpace reads it through a fixed project/job path and verifies each listed adapter file again. Artifact paths that attempt to escape the adapter directory are rejected.

Supabase metadata migration `0031_model_foundry_metadata.sql` stores only owner-scoped project, dataset-version, job, model-version, evaluation, and deployment metadata. It deliberately excludes raw examples, weights, checkpoints, prompts, outputs, and logs. Applying the migration remains an environment/deployment operation and is not performed by local app code.

## Known boundaries

Verified real adapters can be selected from their completed Training Lab run with **Use in chat**. VibeSpace routes the bounded project/job adapter identity through the native worker, verifies the artifact again, and generates locally without a network service. Fixture-mode deployment records still represent local routing intent and must not be read as a running inference server.

## Focused checks

Run from `app` / `app/src-tauri`:

```powershell
python -m py_compile src-tauri\workers\model_foundry\worker.py src-tauri\workers\model_foundry\real_training.py
cargo test --manifest-path src-tauri\Cargo.toml --lib model_foundry_training::tests
cargo test --manifest-path src-tauri\Cargo.toml --lib model_foundry_download::tests
npm run typecheck
```

The full TypeScript check can be slower than the focused native checks on an actively running desktop workspace.
