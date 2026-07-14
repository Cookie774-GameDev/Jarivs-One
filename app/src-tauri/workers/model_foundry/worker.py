#!/usr/bin/env python3
"""VibeModel Foundry worker protocol v1.

This worker owns no network server and accepts only bounded NDJSON commands over
stdin. It is intentionally stdlib-only so the supervisor can verify the
protocol before installing the pinned real-training environment.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import queue
import shutil
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = 1
MAX_MESSAGE_BYTES = 64 * 1024
TERMINAL_STATES = {"completed", "cancelled", "failed", "interrupted"}
ALLOWED_OPERATIONS = {"handshake", "validate", "train", "resume", "infer", "cancel", "stop_after_checkpoint", "health"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def write_message(message: dict[str, Any], lock: threading.Lock) -> None:
    encoded = json.dumps(message, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ValueError("worker response exceeds protocol limit")
    with lock:
        sys.stdout.write(encoded + "\n")
        sys.stdout.flush()


def confined_path(raw: str, root: Path) -> Path:
    candidate = Path(raw).resolve(strict=False)
    resolved_root = root.resolve(strict=True)
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError("path is outside the assigned job directory") from exc
    return candidate


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, separators=(",", ":"), ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


class Worker:
    def __init__(self, job_dir: Path, model_root: Path, heartbeat_seconds: float, step_seconds: float) -> None:
        self.job_dir = job_dir.resolve(strict=True)
        self.model_root = model_root.resolve(strict=False)
        self.heartbeat_seconds = max(0.05, heartbeat_seconds)
        self.step_seconds = max(0.02, step_seconds)
        self.output_lock = threading.Lock()
        self.active_lock = threading.Lock()
        self.cancel_event = threading.Event()
        self.stop_after_checkpoint = threading.Event()
        self.active: tuple[str, str] | None = None
        self.thread: threading.Thread | None = None

    def emit_error(
        self,
        request_id: str,
        job_id: str,
        code: str,
        message: str,
        recoverable: bool = False,
        suggestions: list[str] | None = None,
        sequence: int = 1,
    ) -> None:
        write_message({
            "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id,
            "jobId": job_id, "sequence": sequence, "state": "failed", "timestamp": utc_now(),
            "artifactManifestPath": None, "checkpointPath": None,
            "error": {
                "code": code, "message": message, "recoverable": recoverable,
                "correlationId": request_id, "suggestions": suggestions or [],
            },
        }, self.output_lock)

    def handle(self, command: dict[str, Any]) -> None:
        request_id = str(command.get("requestId", "invalid"))[:128]
        job_id = str(command.get("jobId", "invalid"))[:128]
        operation = command.get("operation")
        if command.get("protocolVersion") != PROTOCOL_VERSION or command.get("type") != "command":
            self.emit_error(request_id, job_id, "worker.protocol_version", "Unsupported worker protocol envelope.")
            return
        if operation not in ALLOWED_OPERATIONS:
            self.emit_error(request_id, job_id, "worker.operation", "Unsupported worker operation.")
            return
        if operation in {"handshake", "health"}:
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id, "jobId": job_id,
                "sequence": 1, "state": "completed", "timestamp": utc_now(), "artifactManifestPath": None,
                "checkpointPath": None, "error": None,
                "capabilities": ["validate", "train", "resume", "infer", "cancel", "stop_after_checkpoint", "heartbeat", "checkpoint"],
                "workerVersion": "0.1.0",
            }, self.output_lock)
            return
        if operation == "cancel":
            self.cancel_event.set()
            return
        if operation == "stop_after_checkpoint":
            self.stop_after_checkpoint.set()
            return
        manifest_raw = command.get("manifestPath")
        if not isinstance(manifest_raw, str):
            self.emit_error(request_id, job_id, "worker.manifest", "A manifest path is required.")
            return
        try:
            manifest_path = confined_path(manifest_raw, self.job_dir)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(manifest, dict) or manifest.get("jobId") != job_id:
                raise ValueError("manifest identity does not match the command")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            self.emit_error(request_id, job_id, "worker.manifest", str(exc)[:240])
            return
        if operation == "validate":
            if manifest.get("backend") == "real":
                try:
                    module = self.load_real_training_module()
                    module.validate_manifest(manifest, self.job_dir, self.model_root)
                except Exception as exc:
                    code = getattr(exc, "code", "training.validation")
                    suggestions = getattr(exc, "suggestions", [])
                    self.emit_error(request_id, job_id, code, str(exc)[:240], getattr(exc, "recoverable", False), suggestions)
                    return
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id, "jobId": job_id,
                "sequence": 1, "state": "completed", "timestamp": utc_now(), "artifactManifestPath": None,
                "checkpointPath": None, "error": None, "manifestSha256": checksum(manifest_path),
            }, self.output_lock)
            return
        with self.active_lock:
            if self.active is not None:
                self.emit_error(request_id, job_id, "worker.busy", "This worker already has an active job.", True)
                return
            self.active = (request_id, job_id)
            self.cancel_event.clear()
            self.stop_after_checkpoint.clear()
            target = self.run_inference if operation == "infer" else self.run_evaluation if operation == "evaluate" else self.run_training
            self.thread = threading.Thread(target=target, args=(request_id, job_id, manifest_path, manifest, operation), daemon=False)
            self.thread.start()

    def run_inference(self, request_id: str, job_id: str, manifest_path: Path, manifest: dict[str, Any], operation: str) -> None:
        try:
            if manifest.get("backend") != "real-inference":
                raise ValueError("inference requires a real-inference manifest")
            module = self.load_real_training_module()
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "progress", "requestId": request_id,
                "jobId": job_id, "sequence": 1, "phase": "loading_model", "progress": 0.15,
                "timestamp": utc_now(), "message": "Loading verified local adapter",
            }, self.output_lock)
            result = module.run_real_inference(manifest, self.job_dir, self.model_root)
            text = result.get("text")
            if not isinstance(text, str) or not text:
                raise ValueError("inference produced no text")
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id, "jobId": job_id,
                "sequence": 2, "state": "completed", "timestamp": utc_now(), "artifactManifestPath": None,
                "checkpointPath": None, "error": None, "output": {"text": text, "inputTokens": result.get("inputTokens", 0), "outputTokens": result.get("outputTokens", 0)},
            }, self.output_lock)
        except Exception as exc:
            code = getattr(exc, "code", "inference.failed")
            self.emit_error(request_id, job_id, code, str(exc)[:240])
        finally:
            with self.active_lock:
                self.active = None

    def run_evaluation(self, request_id: str, job_id: str, manifest_path: Path, manifest: dict[str, Any], operation: str) -> None:
        try:
            if manifest.get("backend") != "real-evaluation":
                raise ValueError("evaluation requires a real-evaluation manifest")
            module = self.load_real_training_module()
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "progress", "requestId": request_id,
                "jobId": job_id, "sequence": 1, "phase": "evaluating", "progress": 0.15,
                "timestamp": utc_now(), "message": "Comparing the verified adapter with its pinned base model",
            }, self.output_lock)
            report = module.run_real_evaluation(manifest, self.job_dir, self.model_root)
            write_message({
                "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id, "jobId": job_id,
                "sequence": 2, "state": "completed", "timestamp": utc_now(), "artifactManifestPath": None,
                "checkpointPath": None, "error": None, "evaluation": report,
            }, self.output_lock)
        except Exception as exc:
            code = getattr(exc, "code", "evaluation.failed")
            self.emit_error(request_id, job_id, code, str(exc)[:240], getattr(exc, "recoverable", False), getattr(exc, "suggestions", []))
        finally:
            with self.active_lock:
                self.active = None

    def run_training(self, request_id: str, job_id: str, manifest_path: Path, manifest: dict[str, Any], operation: str) -> None:
        sequence = 0
        checkpoint: Path | None = None
        phases = [("validating", 0.05), ("preparing", 0.15), ("loading_model", 0.25), ("loading_dataset", 0.35), ("training", 0.65), ("checkpointing", 0.82), ("validating_model", 0.92), ("finalizing", 0.98)]
        try:
            if manifest.get("backend") == "real":
                self.run_real_backend(request_id, job_id, manifest, operation)
                return
            if operation == "resume":
                raw_checkpoint = manifest.get("resumeCheckpointPath")
                expected = manifest.get("resumeCheckpointSha256")
                if not isinstance(raw_checkpoint, str) or not isinstance(expected, str):
                    raise ValueError("resume checkpoint metadata is required")
                checkpoint = confined_path(raw_checkpoint, self.job_dir)
                if checksum(checkpoint) != expected:
                    raise ValueError("resume checkpoint checksum mismatch")
            last_heartbeat = 0.0
            for phase, progress in phases:
                if self.cancel_event.is_set():
                    self.emit_result(request_id, job_id, sequence + 1, "cancelled", checkpoint, None)
                    return
                sequence += 1
                now = time.monotonic()
                resource = {"ramBytes": None, "vramBytes": None, "diskFreeBytes": shutil.disk_usage(self.job_dir).free}
                write_message({
                    "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "progress", "requestId": request_id,
                    "jobId": job_id, "sequence": sequence, "phase": phase, "progress": progress,
                    "timestamp": utc_now(), "message": phase.replace("_", " ").title(), "resource": resource,
                }, self.output_lock)
                if now - last_heartbeat >= self.heartbeat_seconds:
                    sequence += 1
                    write_message({
                        "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "heartbeat", "requestId": request_id,
                        "jobId": job_id, "sequence": sequence, "phase": phase, "progress": progress,
                        "timestamp": utc_now(), "message": "Worker heartbeat", "resource": resource,
                    }, self.output_lock)
                    last_heartbeat = now
                if phase == "checkpointing":
                    checkpoint = self.job_dir / "checkpoints" / "checkpoint-0001.json"
                    atomic_json(checkpoint, {"protocolVersion": PROTOCOL_VERSION, "jobId": job_id, "manifestSha256": checksum(manifest_path), "createdAt": utc_now()})
                    if self.stop_after_checkpoint.is_set():
                        self.emit_result(request_id, job_id, sequence + 1, "interrupted", checkpoint, None)
                        return
                time.sleep(self.step_seconds)
            artifact = self.job_dir / "artifacts" / "artifact-manifest.json"
            atomic_json(artifact, {
                "protocolVersion": PROTOCOL_VERSION, "jobId": job_id, "kind": "fixture-adapter",
                "truthfulLabel": "worker protocol fixture; no model weights were trained", "createdAt": utc_now(),
                "checkpointSha256": checksum(checkpoint) if checkpoint else None,
            })
            self.emit_result(request_id, job_id, sequence + 1, "completed", checkpoint, artifact)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            self.emit_error(request_id, job_id, "worker.validation", str(exc)[:240], checkpoint is not None)
        finally:
            with self.active_lock:
                self.active = None

    def load_real_training_module(self) -> Any:
        module_path = Path(__file__).with_name("real_training.py")
        spec = importlib.util.spec_from_file_location("vibespace_real_training", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError("Real training module could not be loaded.")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def run_real_backend(
        self,
        request_id: str,
        job_id: str,
        manifest: dict[str, Any],
        operation: str,
    ) -> None:
        sequence = 0
        sequence_lock = threading.Lock()
        heartbeat_stop = threading.Event()
        current = {"phase": "validating", "progress": 0.0}

        def resource() -> dict[str, int | None]:
            return {"ramBytes": None, "vramBytes": None, "diskFreeBytes": shutil.disk_usage(self.job_dir).free}

        def emit(phase: str, progress: float, message: str) -> None:
            nonlocal sequence
            with sequence_lock:
                current.update(phase=phase, progress=progress)
                sequence += 1
                write_message({
                    "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "progress",
                    "requestId": request_id, "jobId": job_id, "sequence": sequence,
                    "phase": phase, "progress": progress, "timestamp": utc_now(),
                    "message": message, "resource": resource(),
                }, self.output_lock)

        def heartbeat() -> None:
            nonlocal sequence
            while not heartbeat_stop.wait(self.heartbeat_seconds):
                with sequence_lock:
                    sequence += 1
                    write_message({
                        "protocolVersion": PROTOCOL_VERSION, "type": "event", "kind": "heartbeat",
                        "requestId": request_id, "jobId": job_id, "sequence": sequence,
                        "phase": current["phase"], "progress": current["progress"], "timestamp": utc_now(),
                        "message": "Worker heartbeat", "resource": resource(),
                    }, self.output_lock)

        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()

        try:
            if operation == "resume" and not manifest.get("resumeCheckpointPath"):
                raise ValueError("resumeCheckpointPath is required for resume")
            module = self.load_real_training_module()
            result = module.run_real_training(
                manifest,
                self.job_dir,
                self.model_root,
                self.cancel_event.is_set,
                self.stop_after_checkpoint.is_set,
                emit,
            )
            checkpoint_raw = result.get("checkpointPath")
            artifact_raw = result.get("artifactManifestPath")
            checkpoint = Path(checkpoint_raw) if checkpoint_raw else None
            artifact = Path(artifact_raw) if artifact_raw else None
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=self.heartbeat_seconds + 1)
            with sequence_lock:
                self.emit_result(request_id, job_id, sequence + 1, result["state"], checkpoint, artifact)
        except Exception as exc:
            code = getattr(exc, "code", "training.failed")
            recoverable = getattr(exc, "recoverable", False)
            suggestions = getattr(exc, "suggestions", [])
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=self.heartbeat_seconds + 1)
            with sequence_lock:
                self.emit_error(request_id, job_id, code, str(exc)[:240], recoverable, suggestions, sequence + 1)
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=self.heartbeat_seconds + 1)
    def emit_result(self, request_id: str, job_id: str, sequence: int, state: str, checkpoint: Path | None, artifact: Path | None) -> None:
        if state not in TERMINAL_STATES:
            raise ValueError("invalid terminal state")
        write_message({
            "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id, "jobId": job_id,
            "sequence": sequence, "state": state, "timestamp": utc_now(),
            "artifactManifestPath": str(artifact) if artifact else None,
            "checkpointPath": str(checkpoint) if checkpoint else None, "error": None,
        }, self.output_lock)


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--job-dir", required=True)
    parser.add_argument("--model-root")
    parser.add_argument("--heartbeat-seconds", type=float, default=5.0)
    parser.add_argument("--step-seconds", type=float, default=0.1)
    args = parser.parse_args()
    job_dir = Path(args.job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)
    worker = Worker(job_dir, Path(args.model_root) if args.model_root else job_dir / "models", args.heartbeat_seconds, args.step_seconds)
    for raw in sys.stdin.buffer:
        if len(raw) > MAX_MESSAGE_BYTES:
            worker.emit_error("invalid", "invalid", "worker.message_size", "Worker command exceeds the protocol limit.")
            continue
        try:
            command = json.loads(raw.decode("utf-8"))
            if not isinstance(command, dict):
                raise ValueError("command must be a JSON object")
            worker.handle(command)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            worker.emit_error("invalid", "invalid", "worker.malformed_json", "Worker command is malformed.")
    if worker.thread is not None:
        worker.thread.join(timeout=10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
