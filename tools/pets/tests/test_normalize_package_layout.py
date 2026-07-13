import hashlib
import json
from pathlib import Path
import sys
import zipfile


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.normalize_package_layout import (
    collect_source_hashes,
    create_complete_package_zip,
    write_source_hash_inventory,
)


def test_collect_source_hashes_is_relative_sorted_and_excludes_generated_archive(
    tmp_path: Path,
) -> None:
    (tmp_path / "layers").mkdir()
    (tmp_path / "layers" / "b.png").write_bytes(b"b")
    (tmp_path / "a.txt").write_bytes(b"a")
    generated = tmp_path / "archival" / "vibespace_axolotl_layered_package.zip"
    generated.parent.mkdir()
    generated.write_bytes(b"generated")

    hashes = collect_source_hashes(tmp_path, exclude={generated})

    assert list(hashes) == ["a.txt", "layers/b.png"]
    assert hashes["a.txt"] == hashlib.sha256(b"a").hexdigest()


def test_create_complete_package_zip_is_deterministic_and_excludes_itself(
    tmp_path: Path,
) -> None:
    (tmp_path / "archival").mkdir()
    (tmp_path / "layers").mkdir()
    (tmp_path / "archival" / "rig.psd").write_bytes(b"psd")
    (tmp_path / "layers" / "body.png").write_bytes(b"png")
    output = tmp_path / "archival" / "vibespace_axolotl_layered_package.zip"

    first = create_complete_package_zip(tmp_path, output)
    first_bytes = output.read_bytes()
    second = create_complete_package_zip(tmp_path, output)

    assert first == second
    assert output.read_bytes() == first_bytes
    with zipfile.ZipFile(output) as archive:
        assert archive.namelist() == ["archival/rig.psd", "layers/body.png"]
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist())


def test_write_source_hash_inventory_excludes_generated_outputs(tmp_path: Path) -> None:
    source = tmp_path / "archival" / "rig.psd"
    source.parent.mkdir()
    source.write_bytes(b"psd")
    inventory = tmp_path / "archival" / "source-hashes.json"
    archive = tmp_path / "archival" / "package.zip"
    archive.write_bytes(b"derived")

    document = write_source_hash_inventory(tmp_path, inventory, archive_output=archive)

    assert document["schemaVersion"] == 1
    assert document["hashAlgorithm"] == "sha256"
    assert document["files"] == {
        "archival/rig.psd": hashlib.sha256(b"psd").hexdigest()
    }
    assert json.loads(inventory.read_text(encoding="utf-8")) == document
