import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

WORKER = Path(__file__).with_name("worker.py")


def command(operation, request_id="req-1", job_id="job-1", **extra):
    return {"protocolVersion": 1, "type": "command", "requestId": request_id, "jobId": job_id, "operation": operation, **extra}


class WorkerProtocolTests(unittest.TestCase):
    def start(self, root: Path, step="0.02"):
        return subprocess.Popen(
            [sys.executable, "-I", str(WORKER), "--job-dir", str(root), "--heartbeat-seconds", "0.05", "--step-seconds", step],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1,
            env={"PATH": "", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
        )

    def send(self, process, payload):
        process.stdin.write(json.dumps(payload) + "\n")
        process.stdin.flush()

    def read_until_result(self, process, timeout=5):
        deadline = time.time() + timeout
        messages = []
        while time.time() < deadline:
            line = process.stdout.readline()
            if not line:
                break
            message = json.loads(line)
            messages.append(message)
            if message["type"] == "result":
                return messages
        self.fail("worker did not emit a terminal result")

    def test_handshake_reports_bounded_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            process = self.start(Path(directory))
            self.send(process, command("handshake"))
            result = self.read_until_result(process)[-1]
            process.stdin.close(); process.wait(timeout=5); process.stdout.close(); process.stderr.close()
            self.assertEqual(result["state"], "completed")
            self.assertIn("cancel", result["capabilities"])
            self.assertNotIn("shell", result["capabilities"])

    def test_rejects_manifest_path_outside_job_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as outside:
                json.dump({"jobId": "job-1"}, outside)
                outside_path = Path(outside.name)
            process = self.start(Path(directory))
            self.send(process, command("validate", manifestPath=str(outside_path)))
            result = self.read_until_result(process)[-1]
            process.stdin.close(); process.wait(timeout=5); process.stdout.close(); process.stderr.close()
            outside_path.unlink(missing_ok=True)
            self.assertEqual(result["state"], "failed")
            self.assertEqual(result["error"]["code"], "worker.manifest")

    def test_training_emits_heartbeats_and_atomic_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); manifest = root / "training-manifest.json"
            manifest.write_text(json.dumps({"jobId": "job-1"}), encoding="utf-8")
            process = self.start(root)
            self.send(process, command("train", manifestPath=str(manifest)))
            messages = self.read_until_result(process)
            process.stdin.close(); process.wait(timeout=5); process.stdout.close(); process.stderr.close()
            result = messages[-1]
            self.assertEqual(result["state"], "completed")
            self.assertTrue(any(item.get("kind") == "heartbeat" for item in messages))
            self.assertTrue(Path(result["checkpointPath"]).is_file())
            self.assertFalse(any(root.rglob("*.tmp")))

    def test_graceful_cancel_is_terminal_and_does_not_create_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); manifest = root / "training-manifest.json"
            manifest.write_text(json.dumps({"jobId": "job-1"}), encoding="utf-8")
            process = self.start(root, step="0.2")
            self.send(process, command("train", manifestPath=str(manifest)))
            json.loads(process.stdout.readline())
            self.send(process, command("cancel", request_id="cancel-1", manifestPath=str(manifest)))
            messages = self.read_until_result(process)
            process.stdin.close(); process.wait(timeout=5); process.stdout.close(); process.stderr.close()
            self.assertEqual(messages[-1]["state"], "cancelled")
            self.assertFalse((root / "artifacts" / "artifact-manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
