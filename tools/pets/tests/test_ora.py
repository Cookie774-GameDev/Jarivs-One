from pathlib import Path
import sys
import zipfile

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.ora import OraValidationError, inspect_ora


ORA_PATH = (
    REPO_ROOT
    / "grok"
    / "pets"
    / "input"
    / "characters"
    / "vibespace-axolotl-pixel"
    / "archival"
    / "vibespace_axolotl_animation_rig.ora"
)


def test_inspect_ora_reports_expected_layered_structure() -> None:
    result = inspect_ora(ORA_PATH)

    assert result.leaf_layer_count == 136
    assert result.group_count == 23
    assert result.layer_png_count == 136
    assert result.has_merged_image is True
    assert result.has_thumbnail is True
    assert result.mimetype == "image/openraster"


def test_inspect_ora_rejects_missing_stack_xml(tmp_path: Path) -> None:
    bad = tmp_path / "missing-stack.ora"
    with zipfile.ZipFile(bad, "w") as archive:
        archive.writestr("mimetype", "image/openraster")

    with pytest.raises(OraValidationError, match="stack.xml"):
        inspect_ora(bad)


def test_inspect_ora_rejects_traversal_member(tmp_path: Path) -> None:
    bad = tmp_path / "traversal.ora"
    with zipfile.ZipFile(bad, "w") as archive:
        archive.writestr("mimetype", "image/openraster")
        archive.writestr("stack.xml", '<image><stack name="root" /></image>')
        archive.writestr("../escape.png", b"not-an-image")

    with pytest.raises(OraValidationError, match="unsafe"):
        inspect_ora(bad)
