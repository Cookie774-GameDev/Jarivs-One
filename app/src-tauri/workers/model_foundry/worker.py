#!/usr/bin/env python3
"""VibeModel Foundry worker protocol v1.

This worker owns no network server and accepts only bounded NDJSON commands over
stdin. It is intentionally stdlib-only so the supervisor can verify the
protocol before installing the pinned real-training environment.
"""
from __future__ import annotations

import argparse
import hashlib
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
ALLOWED_OPERATIONS = {"handshake", "validate", "train", "resume", "cancel", "stop_after_checkpoint", "health"}


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
    def __init__(self, job_dir: Path, heartbeat_seconds: float, step_seconds: float) -> None:
        self.job_dir = job_dir.resolve(strict=True)
        self.heartbeat_seconds = max(0.05, heartbeat_seconds)
        self.step_seconds = max(0.02, step_seconds)
        self.output_lock = threading.Lock()
        self.active_lock = threading.Lock()
        self.cancel_event = threading.Event()
        self.stop_after_checkpoint = threading.Event()
        self.active: tuple[str, str] | None = None
        self.thread: threading.Thread | None = None

    def emit_error(self, request_id: str, job_id: str, code: str, message: str, recoverable: bool = False) -> None:
        write_message({
            "protocolVersion": PROTOCOL_VERSION, "type": "result", "requestId": request_id,
            "jobId": job_id, "sequence": 1, "state": "failed", "timestamp": utc_now(),
            "artifactManifestPath": None, "checkpointPath": None,
            "error": {"code": code, "message": message, "recoverable": recoverable, "correlationId": request_id},
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
                "capabilities": ["validate", "train", "resume", "cancel", "stop_after_checkpoint", "heartbeat", "checkpoint"],
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
            self.thread = threading.Thread(target=self.run_training, args=(request_id, job_id, manifest_path, manifest, operation), daemon=False)
            self.thread.start()

    def run_training(self, request_id: str, job_id: str, manifest_path: Path, manifest: dict[str, Any], operation: str) -> None:
        sequence = 0
        checkpoint: Path | None = None
        phases = [("validating", 0.05), ("preparing", 0.15), ("loading_model", 0.25), ("loading_dataset", 0.35), ("training", 0.65), ("checkpointing", 0.82), ("validating_model", 0.92), ("finalizing", 0.98)]
        try:
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
    parser.add_argument("--heartbeat-seconds", type=float, default=5.0)
    parser.add_argument("--step-seconds", type=float, default=0.1)
    args = parser.parse_args()
    job_dir = Path(args.job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)
    worker = Worker(job_dir, args.heartbeat_seconds, args.step_seconds)
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
