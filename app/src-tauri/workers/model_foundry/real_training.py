"""Local-only LoRA/QLoRA training implementation for Model Foundry.

Heavy dependencies are imported only inside ``run_real_training`` so the
stdlib worker handshake remains available before the optional runtime is
installed. Every path and digest is validated before model code is loaded.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import shutil
from pathlib import Path
from typing import Any, Callable, Iterable

IGNORE_INDEX = -100
OOM_SUGGESTIONS = [
    "Reduce the per-device batch size.",
    "Reduce the maximum sequence length.",
    "Increase gradient accumulation instead of batch size.",
    "Use QLoRA only when a supported CUDA and bitsandbytes runtime is available.",
    "Choose CPU offload explicitly if the device has enough system memory.",
]


class TrainingFailure(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        recoverable: bool = False,
        suggestions: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.recoverable = recoverable
        self.suggestions = suggestions or []


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_child(raw: str, root: Path, label: str, *, must_exist: bool = True) -> Path:
    if not isinstance(raw, str) or not raw.strip():
        raise TrainingFailure("training.manifest", f"{label} is required.")
    resolved_root = root.resolve(strict=True)
    candidate = Path(raw).resolve(strict=must_exist)
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise TrainingFailure("training.path_scope", f"{label} is outside its allowed root.") from exc
    return candidate


def completion_only_labels(input_ids: list[int], prompt_token_count: int) -> list[int]:
    """Return labels that train only on assistant/completion tokens."""
    if prompt_token_count < 0 or prompt_token_count > len(input_ids):
        raise TrainingFailure("training.loss_mask", "Prompt token count is outside the encoded sequence.")
    return [IGNORE_INDEX] * prompt_token_count + input_ids[prompt_token_count:]


def qlora_support_error(cuda_available: bool, bitsandbytes_available: bool) -> TrainingFailure | None:
    if not cuda_available:
        return TrainingFailure(
            "training.qlora_cuda_required",
            "QLoRA requires a verified CUDA device; the configuration was not changed.",
            suggestions=["Use LoRA on CPU or select a CUDA-capable device explicitly."],
        )
    if not bitsandbytes_available:
        return TrainingFailure(
            "training.qlora_bitsandbytes_missing",
            "QLoRA requires the pinned bitsandbytes dependency; the configuration was not changed.",
            suggestions=["Install the optional pinned QLoRA runtime from Model Foundry."],
        )
    return None


def out_of_memory_failure() -> TrainingFailure:
    return TrainingFailure(
        "training.out_of_memory",
        "Training ran out of memory. Model Foundry did not silently alter the run configuration.",
        recoverable=True,
        suggestions=OOM_SUGGESTIONS.copy(),
    )


def _positive_number(config: dict[str, Any], key: str, kind: type[int] | type[float]) -> int | float:
    value = config.get(key)
    if kind is int and (not isinstance(value, int) or isinstance(value, bool)):
        raise TrainingFailure("training.manifest", f"{key} must be an integer.")
    if kind is float and (not isinstance(value, (int, float)) or isinstance(value, bool)):
        raise TrainingFailure("training.manifest", f"{key} must be numeric.")
    if value <= 0:
        raise TrainingFailure("training.manifest", f"{key} must be greater than zero.")
    return kind(value)


def validate_manifest(manifest: dict[str, Any], job_dir: Path, model_root: Path) -> dict[str, Any]:
    if manifest.get("backend") != "real":
        raise TrainingFailure("training.backend", "Real training requires backend='real'.")
    model_dir = canonical_child(manifest.get("modelDir"), model_root, "modelDir")
    train_path = canonical_child(manifest.get("trainDatasetPath"), job_dir, "trainDatasetPath")
    validation_path = canonical_child(manifest.get("validationDatasetPath"), job_dir, "validationDatasetPath")
    output_dir = canonical_child(manifest.get("outputDir"), job_dir, "outputDir", must_exist=False)
    if output_dir == job_dir.resolve(strict=True):
        raise TrainingFailure("training.path_scope", "outputDir must be a child of the job directory.")

    config = manifest.get("trainingConfig")
    if not isinstance(config, dict):
        raise TrainingFailure("training.manifest", "trainingConfig is required.")
    method = config.get("method")
    if method not in {"lora", "qlora"}:
        raise TrainingFailure("training.manifest", "Training method must be lora or qlora.")
    normalized_config = {
        "method": method,
        "seed": _positive_number(config, "seed", int),
        "epochs": _positive_number(config, "epochs", int),
        "batchSize": _positive_number(config, "batchSize", int),
        "gradientAccumulation": _positive_number(config, "gradientAccumulation", int),
        "maxSequenceLength": _positive_number(config, "maxSequenceLength", int),
        "learningRate": _positive_number(config, "learningRate", float),
        "loraRank": _positive_number(config, "loraRank", int),
        "loraAlpha": _positive_number(config, "loraAlpha", int),
        "loraDropout": float(config.get("loraDropout", 0.05)),
    }
    if not 0 <= normalized_config["loraDropout"] < 1:
        raise TrainingFailure("training.manifest", "loraDropout must be at least zero and less than one.")
    if normalized_config["maxSequenceLength"] > 32768:
        raise TrainingFailure("training.manifest", "maxSequenceLength exceeds the bounded maximum.")

    required_names = ["config.json", "tokenizer_config.json"]
    missing = [name for name in required_names if not (model_dir / name).is_file()]
    tokenizer_present = any((model_dir / name).is_file() for name in ("tokenizer.json", "tokenizer.model", "vocab.json"))
    weights = sorted(model_dir.glob("*.safetensors"))
    if not tokenizer_present:
        missing.append("tokenizer.json/tokenizer.model/vocab.json")
    if not weights:
        missing.append("*.safetensors")
    if missing:
        raise TrainingFailure("training.model_incomplete", "Local model snapshot is incomplete: " + ", ".join(missing))

    expected_files = manifest.get("modelFiles")
    if not isinstance(expected_files, dict) or not expected_files:
        raise TrainingFailure("training.model_checksums", "modelFiles must contain pinned SHA-256 digests.")
    required_for_digest = {path.name for path in model_dir.iterdir() if path.is_file()}
    if not required_for_digest.issubset(expected_files):
        raise TrainingFailure("training.model_checksums", "Pinned digests are missing for required model files.")
    for relative, expected in expected_files.items():
        if not isinstance(relative, str) or not isinstance(expected, str) or len(expected) != 64:
            raise TrainingFailure("training.model_checksums", "A model file digest is malformed.")
        file_path = canonical_child(str(model_dir / relative), model_dir, "modelFiles entry")
        if not file_path.is_file() or sha256_file(file_path) != expected.lower():
            raise TrainingFailure("training.model_checksum_mismatch", f"Model file verification failed for {relative}.")

    for dataset_path, digest_key in ((train_path, "trainDatasetSha256"), (validation_path, "validationDatasetSha256")):
        expected = manifest.get(digest_key)
        if not isinstance(expected, str) or sha256_file(dataset_path) != expected.lower():
            raise TrainingFailure("training.dataset_checksum_mismatch", f"Dataset verification failed for {digest_key}.")

    return {
        "modelDir": model_dir,
        "trainDatasetPath": train_path,
        "validationDatasetPath": validation_path,
        "outputDir": output_dir,
        "config": normalized_config,
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise TrainingFailure("training.dataset_json", f"Invalid JSONL at line {line_number}.") from exc
            if not isinstance(value, dict):
                raise TrainingFailure("training.dataset_schema", f"Dataset line {line_number} must be an object.")
            prompt = value.get("prompt")
            completion = value.get("completion")
            if not isinstance(prompt, str) or not isinstance(completion, str) or not completion.strip():
                raise TrainingFailure("training.dataset_schema", f"Dataset line {line_number} needs prompt and completion text.")
            examples.append({"prompt": prompt, "completion": completion})
    if not examples:
        raise TrainingFailure("training.dataset_empty", "The dataset contains no trainable examples.")
    return examples


def _encode_examples(tokenizer: Any, examples: Iterable[dict[str, str]], max_length: int) -> list[dict[str, list[int]]]:
    encoded: list[dict[str, list[int]]] = []
    eos = tokenizer.eos_token or ""
    for example in examples:
        prompt_ids = tokenizer(example["prompt"], add_special_tokens=True, truncation=True, max_length=max_length)["input_ids"]
        full_ids = tokenizer(
            example["prompt"] + example["completion"] + eos,
            add_special_tokens=True,
            truncation=True,
            max_length=max_length,
        )["input_ids"]
        if len(full_ids) <= len(prompt_ids):
            continue
        encoded.append({
            "input_ids": full_ids,
            "attention_mask": [1] * len(full_ids),
            "labels": completion_only_labels(full_ids, min(len(prompt_ids), len(full_ids))),
        })
    if not encoded:
        raise TrainingFailure("training.dataset_truncated", "No completion tokens remain at the configured sequence length.")
    return encoded


def _tree_checksums(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256_file(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _atomic_adapter_checkpoint(model: Any, checkpoint_root: Path, step: int, fingerprint: str) -> Path:
    checkpoint_root.mkdir(parents=True, exist_ok=True)
    target = checkpoint_root / f"checkpoint-{step:08d}"
    staging = checkpoint_root / f".checkpoint-{step:08d}.staging"
    if staging.exists():
        shutil.rmtree(staging)
    if target.exists():
        raise TrainingFailure("training.checkpoint_exists", "Refusing to overwrite an existing checkpoint.")
    staging.mkdir(parents=False)
    model.save_pretrained(staging, safe_serialization=True)
    manifest = {
        "formatVersion": 1,
        "step": step,
        "configurationSha256": fingerprint,
        "files": _tree_checksums(staging),
    }
    temporary = staging / "checkpoint-manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, staging / "checkpoint-manifest.json")
    os.replace(staging, target)
    return target


def _verify_resume_checkpoint(path: Path, expected_fingerprint: str) -> None:
    manifest_path = path / "checkpoint-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TrainingFailure("training.resume_manifest", "Resume checkpoint manifest is missing or invalid.") from exc
    if manifest.get("configurationSha256") != expected_fingerprint:
        raise TrainingFailure("training.resume_incompatible", "Resume checkpoint configuration does not match this run.")
    files = manifest.get("files")
    if not isinstance(files, dict):
        raise TrainingFailure("training.resume_manifest", "Resume checkpoint file inventory is invalid.")
    for relative, expected in files.items():
        file_path = canonical_child(str(path / relative), path, "resume checkpoint file")
        if sha256_file(file_path) != expected:
            raise TrainingFailure("training.resume_checksum", f"Resume checkpoint verification failed for {relative}.")


def run_real_inference(manifest: dict[str, Any], job_dir: Path, model_root: Path) -> dict[str, Any]:
    """Generate once from a verified adapter without opening a network service."""
    if manifest.get("backend") != "real-inference":
        raise TrainingFailure("inference.backend", "Local adapter inference requires backend='real-inference'.")
    prompt = manifest.get("prompt")
    max_new_tokens = manifest.get("maxNewTokens")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 16_384:
        raise TrainingFailure("inference.prompt", "Prompt must contain 1 through 16,384 characters.")
    if not isinstance(max_new_tokens, int) or isinstance(max_new_tokens, bool) or not 1 <= max_new_tokens <= 512:
        raise TrainingFailure("inference.output_limit", "maxNewTokens must be between 1 and 512.")
    training_path = canonical_child(manifest.get("trainingManifestPath"), job_dir, "trainingManifestPath")
    try:
        training_manifest = json.loads(training_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TrainingFailure("inference.manifest", "The immutable training manifest is unavailable.") from exc
    validated = validate_manifest(training_manifest, job_dir, model_root)
    artifact_root = canonical_child(str(job_dir / "output" / "artifact"), job_dir, "adapter artifact")
    try:
        artifact_manifest = json.loads((artifact_root / "artifact-manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TrainingFailure("inference.artifact_manifest", "The verified adapter manifest is unavailable.") from exc
    if artifact_manifest.get("formatVersion") != 1 or artifact_manifest.get("kind") != "peft-adapter" or artifact_manifest.get("backend") != "real":
        raise TrainingFailure("inference.artifact_manifest", "The artifact is not a supported local PEFT adapter.")
    adapter_files = artifact_manifest.get("adapterFiles")
    if not isinstance(adapter_files, dict) or not adapter_files:
        raise TrainingFailure("inference.artifact_manifest", "The artifact has no adapter checksum inventory.")
    for relative, expected in adapter_files.items():
        if not isinstance(relative, str) or not isinstance(expected, str):
            raise TrainingFailure("inference.artifact_manifest", "The artifact checksum inventory is malformed.")
        candidate = canonical_child(str(artifact_root / relative), artifact_root, "adapter artifact file")
        if sha256_file(candidate) != expected.lower():
            raise TrainingFailure("inference.artifact_checksum", "An adapter file no longer matches its immutable manifest.")
    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:
        raise TrainingFailure("inference.dependencies_missing", "The optional pinned training runtime is not installed.") from exc
    try:
        tokenizer = AutoTokenizer.from_pretrained(validated["modelDir"], local_files_only=True, trust_remote_code=False)
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            validated["modelDir"], local_files_only=True, trust_remote_code=False,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        )
        model = PeftModel.from_pretrained(model, artifact_root, local_files_only=True)
        model.eval()
        encoded = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
        device = next(model.parameters()).device
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            generated = model.generate(**encoded, max_new_tokens=max_new_tokens, do_sample=False, pad_token_id=tokenizer.eos_token_id)
        input_tokens = int(encoded["input_ids"].shape[-1])
        output_ids = generated[0][input_tokens:]
        text = tokenizer.decode(output_ids, skip_special_tokens=True).strip()
        if not text:
            raise TrainingFailure("inference.empty", "The local adapter returned no generated text.")
        return {"text": text, "inputTokens": input_tokens, "outputTokens": int(output_ids.shape[-1])}
    except (torch.cuda.OutOfMemoryError, MemoryError) as exc:
        raise out_of_memory_failure() from exc


def run_real_training(
    manifest: dict[str, Any],
    job_dir: Path,
    model_root: Path,
    cancel_requested: Callable[[], bool],
    stop_after_checkpoint_requested: Callable[[], bool],
    emit: Callable[[str, float, str], None],
) -> dict[str, Any]:
    validated = validate_manifest(manifest, job_dir, model_root)
    config = validated["config"]
    seed = config["seed"]
    random.seed(seed)
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    emit("loading_model", 0.08, "Loading verified local model")
    try:
        import importlib.util
        import torch
        from peft import LoraConfig, PeftModel, get_peft_model
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            DataCollatorForSeq2Seq,
            Trainer,
            TrainerCallback,
            TrainingArguments,
            set_seed,
        )
    except ImportError as exc:
        raise TrainingFailure(
            "training.dependencies_missing",
            "The optional pinned training runtime is not installed.",
            suggestions=["Prepare the real training runtime from Model Foundry."],
        ) from exc

    set_seed(seed)
    method = config["method"]
    if method == "qlora":
        support = qlora_support_error(torch.cuda.is_available(), importlib.util.find_spec("bitsandbytes") is not None)
        if support:
            raise support
        quantization_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True)
    else:
        quantization_config = None

    model_dir = validated["modelDir"]
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        model_dir,
        local_files_only=True,
        trust_remote_code=False,
        quantization_config=quantization_config,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    fingerprint_payload = json.dumps({"modelFiles": manifest["modelFiles"], "trainingConfig": config}, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(fingerprint_payload.encode("utf-8")).hexdigest()
    resume_raw = manifest.get("resumeCheckpointPath")
    if resume_raw:
        resume_path = canonical_child(resume_raw, job_dir, "resumeCheckpointPath")
        _verify_resume_checkpoint(resume_path, fingerprint)
        model = PeftModel.from_pretrained(model, resume_path, is_trainable=True, local_files_only=True)
    else:
        target_modules = manifest.get("targetModules")
        if target_modules is not None and (not isinstance(target_modules, list) or not all(isinstance(item, str) for item in target_modules)):
            raise TrainingFailure("training.manifest", "targetModules must be a list of module names.")
        lora_config = LoraConfig(
            r=config["loraRank"],
            lora_alpha=config["loraAlpha"],
            lora_dropout=config["loraDropout"],
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=target_modules,
        )
        model = get_peft_model(model, lora_config)

    emit("loading_dataset", 0.18, "Encoding immutable train and validation datasets")
    train_rows = _encode_examples(tokenizer, _read_jsonl(validated["trainDatasetPath"]), config["maxSequenceLength"])
    validation_rows = _encode_examples(tokenizer, _read_jsonl(validated["validationDatasetPath"]), config["maxSequenceLength"])

    class ListDataset(torch.utils.data.Dataset):
        def __init__(self, rows: list[dict[str, list[int]]]) -> None:
            self.rows = rows

        def __len__(self) -> int:
            return len(self.rows)

        def __getitem__(self, index: int) -> dict[str, list[int]]:
            return self.rows[index]

    state: dict[str, Any] = {"cancelled": False, "stoppedAfterCheckpoint": False, "checkpoint": None}
    checkpoint_root = validated["outputDir"] / "checkpoints"
    total_steps = max(1, math.ceil(len(train_rows) / config["batchSize"] / config["gradientAccumulation"]) * config["epochs"])

    class GovernanceCallback(TrainerCallback):
        def on_step_end(self, args: Any, trainer_state: Any, control: Any, **kwargs: Any) -> Any:
            progress = min(0.9, 0.2 + 0.65 * trainer_state.global_step / total_steps)
            emit("training", progress, f"Training step {trainer_state.global_step} of {total_steps}")
            if cancel_requested():
                state["cancelled"] = True
                control.should_training_stop = True
            return control

        def on_epoch_end(self, args: Any, trainer_state: Any, control: Any, **kwargs: Any) -> Any:
            state["checkpoint"] = _atomic_adapter_checkpoint(kwargs["model"], checkpoint_root, trainer_state.global_step, fingerprint)
            emit("checkpointing", min(0.94, 0.25 + 0.65 * trainer_state.global_step / total_steps), "Saved verified adapter checkpoint")
            if stop_after_checkpoint_requested():
                state["stoppedAfterCheckpoint"] = True
                control.should_training_stop = True
            return control

    training_args = TrainingArguments(
        output_dir=str(validated["outputDir"] / "trainer-state"),
        overwrite_output_dir=False,
        do_train=True,
        do_eval=True,
        eval_strategy="epoch",
        save_strategy="no",
        num_train_epochs=config["epochs"],
        per_device_train_batch_size=config["batchSize"],
        per_device_eval_batch_size=config["batchSize"],
        gradient_accumulation_steps=config["gradientAccumulation"],
        learning_rate=config["learningRate"],
        seed=seed,
        data_seed=seed,
        logging_steps=1,
        report_to=[],
        remove_unused_columns=False,
        dataloader_num_workers=0,
        use_cpu=not torch.cuda.is_available(),
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=ListDataset(train_rows),
        eval_dataset=ListDataset(validation_rows),
        data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer, padding=True, label_pad_token_id=IGNORE_INDEX),
        callbacks=[GovernanceCallback()],
    )
    try:
        train_result = trainer.train()
    except (torch.cuda.OutOfMemoryError, MemoryError) as exc:
        raise out_of_memory_failure() from exc
    if state["cancelled"]:
        return {"state": "cancelled", "checkpointPath": state["checkpoint"]}
    if state["stoppedAfterCheckpoint"]:
        return {"state": "interrupted", "checkpointPath": state["checkpoint"]}

    emit("validating_model", 0.95, "Running validation")
    metrics = trainer.evaluate()
    if state["checkpoint"] is None:
        state["checkpoint"] = _atomic_adapter_checkpoint(model, checkpoint_root, trainer.state.global_step, fingerprint)
    artifact_dir = validated["outputDir"] / "artifact"
    staging = validated["outputDir"] / ".artifact.staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    model.save_pretrained(staging, safe_serialization=True)
    artifact_manifest = {
        "formatVersion": 1,
        "kind": "peft-adapter",
        "backend": "real",
        "baseModelFiles": manifest["modelFiles"],
        "trainingConfig": config,
        "datasetDigests": {
            "train": manifest["trainDatasetSha256"],
            "validation": manifest["validationDatasetSha256"],
        },
        "metrics": {key: value for key, value in metrics.items() if isinstance(value, (int, float))},
        "adapterFiles": _tree_checksums(staging),
        "trainRuntimeSeconds": train_result.metrics.get("train_runtime"),
    }
    manifest_path = staging / "artifact-manifest.json"
    manifest_path.write_text(json.dumps(artifact_manifest, separators=(",", ":")), encoding="utf-8")
    if artifact_dir.exists():
        raise TrainingFailure("training.artifact_exists", "Refusing to overwrite an existing training artifact.")
    os.replace(staging, artifact_dir)
    emit("finalizing", 1.0, "Real LoRA adapter is ready for evaluation")
    return {
        "state": "completed",
        "checkpointPath": state["checkpoint"],
        "artifactManifestPath": artifact_dir / "artifact-manifest.json",
    }
