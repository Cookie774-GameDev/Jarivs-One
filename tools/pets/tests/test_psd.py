from pathlib import Path
import sys

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.psd import PsdValidationError, inspect_psd


PSD_PATH = (
    REPO_ROOT
    / "grok"
    / "pets"
    / "input"
    / "characters"
    / "vibespace-axolotl-pixel"
    / "archival"
    / "vibespace_axolotl_animation_rig.psd"
)


def test_inspect_psd_reports_expected_layered_structure() -> None:
    result = inspect_psd(PSD_PATH)

    assert result.signature == "8BPS"
    assert result.version == 1
    assert (result.width, result.height) == (1254, 1254)
    assert result.layer_record_count == 182
    assert result.section_divider_count == 46
    assert result.leaf_layer_count == 136
    assert result.group_count == 23
    assert result.contains_transparency_layers is True


def test_inspect_psd_rejects_invalid_signature(tmp_path: Path) -> None:
    bad = tmp_path / "bad.psd"
    bad.write_bytes(b"NOPE" + b"\0" * 100)

    with pytest.raises(PsdValidationError, match="signature"):
        inspect_psd(bad)


def test_inspect_psd_rejects_truncated_layer_records(tmp_path: Path) -> None:
    bad = tmp_path / "truncated.psd"
    bad.write_bytes(PSD_PATH.read_bytes()[:128])

    with pytest.raises(PsdValidationError, match="truncated"):
        inspect_psd(bad)
