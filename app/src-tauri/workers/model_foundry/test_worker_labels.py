"""Focused tests for the canonical Model Foundry worker's bounded helpers.

Stdlib-only: exercises the pure label-masking and record-shaping helpers
without requiring torch/transformers to be installed.
"""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

WORKER_PATH = Path(__file__).resolve().parent / "worker.py"


def load_worker():
    spec = importlib.util.spec_from_file_location("vibespace_foundry_worker", WORKER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CompletionOnlyLabelsTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()

    def test_masks_prompt_tokens_with_ignore_index(self):
        labels = self.worker.completion_only_labels([10, 11, 12, 13, 14], 3)
        self.assertEqual(labels, [-100, -100, -100, 13, 14])

    def test_never_masks_more_tokens_than_present(self):
        labels = self.worker.completion_only_labels([10, 11], 99)
        self.assertEqual(labels, [-100, -100])

    def test_zero_or_negative_prompt_count_keeps_all_tokens(self):
        self.assertEqual(self.worker.completion_only_labels([1, 2, 3], 0), [1, 2, 3])
        self.assertEqual(self.worker.completion_only_labels([1, 2, 3], -4), [1, 2, 3])

    def test_empty_record_returns_empty_labels(self):
        self.assertEqual(self.worker.completion_only_labels([], 5), [])


class ExplicitTrainingDeviceTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()

    def test_gpu_only_requires_cuda_and_never_falls_back_to_cpu(self):
        fake_torch = type(
            "FakeTorch",
            (),
            {"cuda": type("Cuda", (), {"is_available": staticmethod(lambda: False)})()},
        )()
        with self.assertRaisesRegex(ValueError, "GPU-only.*CUDA"):
            self.worker._require_training_device(fake_torch, "gpu")

    def test_cpu_only_is_explicit(self):
        fake_torch = type(
            "FakeTorch",
            (),
            {"cuda": type("Cuda", (), {"is_available": staticmethod(lambda: True)})()},
        )()
        self.assertEqual(self.worker._require_training_device(fake_torch, "cpu"), "cpu")


class TrainingArgumentsCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()

    def test_drops_only_the_removed_overwrite_output_dir_argument(self):
        class CurrentTrainingArguments:
            def __init__(self, output_dir, use_cpu=False):
                del output_dir, use_cpu

        self.assertEqual(
            self.worker._compatible_training_arguments(
                CurrentTrainingArguments,
                {
                    "output_dir": "D:/bounded-output",
                    "use_cpu": False,
                    "overwrite_output_dir": False,
                },
            ),
            {"output_dir": "D:/bounded-output", "use_cpu": False},
        )

    def test_rejects_any_other_unexpected_training_argument(self):
        class CurrentTrainingArguments:
            def __init__(self, output_dir):
                del output_dir

        with self.assertRaisesRegex(ValueError, "unsupported training arguments"):
            self.worker._compatible_training_arguments(
                CurrentTrainingArguments,
                {"output_dir": "D:/bounded-output", "silentFallback": True},
            )


class ExampleShapingTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()

    def test_prompt_response_records_build_user_assistant_text(self):
        record = {"prompt": "  Say hi  ", "response": " Hello. "}
        self.assertEqual(
            self.worker._example_text(record),
            "User: Say hi\nAssistant: Hello.",
        )
        self.assertEqual(self.worker._example_prompt_prefix(record), "User: Say hi\nAssistant: ")

    def test_plain_text_records_skip_prompt_masking(self):
        record = {"text": "  A plain note.  "}
        self.assertEqual(self.worker._example_text(record), "A plain note.")
        self.assertEqual(self.worker._example_prompt_prefix(record), "")


class LocalMediaDecodeTests(unittest.TestCase):
    def setUp(self):
        self.worker = load_worker()

    def test_decodes_a_local_image_as_rgb(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "frame.png"
            Image.new("RGBA", (4, 3), (1, 2, 3, 255)).save(path)

            frames = self.worker._load_media_frames(
                {"mediaType": "image", "mediaPath": str(path), "plannedFrames": 1}
            )

            self.assertEqual(len(frames), 1)
            self.assertEqual(frames[0].mode, "RGB")
            self.assertEqual(frames[0].size, (4, 3))

    def test_samples_video_across_the_reported_frame_range(self):
        class FakeImage:
            def __init__(self, index):
                self.index = index

            def convert(self, _mode):
                return self

        class FakeFrame:
            def __init__(self, index):
                self.index = index

            def to_image(self):
                return FakeImage(self.index)

        class FakeContainer:
            def __init__(self):
                self.streams = type("Streams", (), {"video": [type("Stream", (), {"frames": 5})()]})()

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def decode(self, _stream):
                return [FakeFrame(index) for index in range(5)]

        with patch("av.open", return_value=FakeContainer()):
            frames = self.worker._load_media_frames(
                {"mediaType": "video", "mediaPath": "C:/private/clip.mp4", "plannedFrames": 3}
            )

        self.assertEqual([frame.index for frame in frames], [0, 2, 4])


if __name__ == "__main__":
    unittest.main()
