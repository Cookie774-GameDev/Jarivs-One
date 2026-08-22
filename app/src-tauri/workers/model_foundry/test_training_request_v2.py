from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from worker import _read_request


class TrainingRequestV2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.model = self.root / "model"
        self.model.mkdir()
        (self.model / "config.json").write_text("{}", encoding="utf-8")
        self.train = self.root / "train.jsonl"
        self.validation = self.root / "validation.jsonl"
        self.train.write_text(
            json.dumps({"prompt": "Train prompt", "response": "Train response"}),
            encoding="utf-8",
        )
        self.validation.write_text(
            json.dumps({"prompt": "Validation prompt", "response": "Validation response"}),
            encoding="utf-8",
        )
        self.request_path = self.root / "request.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def request(self) -> dict[str, object]:
        return {
            "schemaVersion": 2,
            "protocol": 1,
            "localOnly": True,
            "method": "lora",
            "baseModelPath": str(self.model),
            "datasetPath": str(self.train),
            "validationDatasetPath": str(self.validation),
            "outputDir": str(self.root / "output"),
            "epochs": 3,
            "maxSteps": 77,
            "trainingConfig": {
                "method": "lora",
                "seed": 23,
                "epochs": 3,
                "maxSteps": 77,
                "batchSize": 2,
                "gradientAccumulation": 8,
                "maxSequenceLength": 1024,
                "learningRate": 0.00008,
                "loraRank": 32,
                "loraAlpha": 64,
                "loraDropout": 0.1,
            },
            "targetModules": ["q_proj", "v_proj"],
        }

    def test_preserves_the_closed_configuration_and_validation_split(self) -> None:
        self.request_path.write_text(json.dumps(self.request()), encoding="utf-8")

        normalized, summary = _read_request(str(self.request_path))

        self.assertEqual(normalized["trainingConfig"]["batchSize"], 2)
        self.assertEqual(normalized["trainingConfig"]["gradientAccumulation"], 8)
        self.assertEqual(normalized["trainingConfig"]["learningRate"], 0.00008)
        self.assertEqual(normalized["trainingConfig"]["loraRank"], 32)
        self.assertEqual(normalized["targetModules"], ["q_proj", "v_proj"])
        self.assertEqual(normalized["validationDatasetPath"], str(self.validation.resolve()))
        self.assertEqual(summary["validationExamples"], 1)

    def test_rejects_a_legacy_limit_that_disagrees_with_v2(self) -> None:
        request = self.request()
        request["epochs"] = 2
        self.request_path.write_text(json.dumps(request), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "disagree"):
            _read_request(str(self.request_path))

    def test_rejects_unknown_configuration_fields(self) -> None:
        request = self.request()
        request["trainingConfig"]["silentlyFallback"] = True  # type: ignore[index]
        self.request_path.write_text(json.dumps(request), encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "closed trainingConfig"):
            _read_request(str(self.request_path))


if __name__ == "__main__":
    unittest.main()
