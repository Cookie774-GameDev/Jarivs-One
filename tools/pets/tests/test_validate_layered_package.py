from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest
from jsonschema import Draft202012Validator


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.images import ImageValidationError, inspect_png
from pets_pipeline.validate_layered_package import (
    PackageValidationError,
    validate_character_catalog,
    validate_character_source,
    validate_manifest_document,
    write_source_validation_report,
)


CHARACTER_ROOT = (
    REPO_ROOT
    / "grok"
    / "pets"
    / "input"
    / "characters"
    / "vibespace-axolotl-pixel"
)
MANIFEST_PATH = CHARACTER_ROOT / "archival" / "vibespace_axolotl_layer_manifest.json"
CATALOG_PATH = REPO_ROOT / "grok" / "pets" / "input" / "characters.json"
CATALOG_SCHEMA_PATH = (
    REPO_ROOT
    / "app"
    / "src"
    / "assets"
    / "pets"
    / "schemas"
    / "character-manifest.schema.json"
)
SCHEMA_DIRECTORY = CATALOG_SCHEMA_PATH.parent


def test_validate_character_source_proves_supplied_package_invariants() -> None:
    report = validate_character_source(CHARACTER_ROOT)

    assert report.character_id == "vibespace-axolotl-light"
    assert report.canvas == (1254, 1254)
    assert report.psd.leaf_layer_count == 136
    assert report.psd.group_count == 23
    assert report.ora.leaf_layer_count == 136
    assert report.ora.group_count == 23
    assert report.manifest_layer_count == 136
    assert report.unique_layer_ids is True
    assert report.unique_layer_paths is True
    assert report.missing_layer_files == ()
    assert report.empty_layer_ids == ()
    assert report.invalid_pivot_ids == ()
    assert report.invalid_pivot_references == ()
    assert report.branding_all_non_mirrorable is True
    assert report.default_recomposition_exact is True
    assert report.default_expression == "happy"
    assert report.happy_expression_is_source_extracted is True
    assert report.guide_and_reference_groups_hidden is True
    assert len(report.anatomy_underlap_ids) == 17
    assert report.preview_alpha.partial == 4065


def test_validate_manifest_document_rejects_duplicate_ids() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    duplicate = deepcopy(manifest["layers"][0])
    duplicate["file"] = manifest["layers"][1]["file"]
    manifest["layers"].append(duplicate)

    with pytest.raises(PackageValidationError, match="duplicate layer id"):
        validate_manifest_document(manifest, CHARACTER_ROOT)


def test_validate_manifest_document_rejects_missing_layer_file() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["layers"][0]["file"] = "layers/does-not-exist.png"

    with pytest.raises(PackageValidationError, match="missing layer file"):
        validate_manifest_document(manifest, CHARACTER_ROOT)


def test_inspect_png_enforces_pixel_limit() -> None:
    preview = CHARACTER_ROOT / "previews" / "vibespace_axolotl_preview_transparent.png"

    with pytest.raises(ImageValidationError, match="pixel limit"):
        inspect_png(preview, max_pixels=100)


def test_character_catalog_and_schema_are_valid_and_complete() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    schema = json.loads(CATALOG_SCHEMA_PATH.read_text(encoding="utf-8"))

    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(catalog)
    validate_character_catalog(catalog, CATALOG_PATH.parent)

    rig_profiles = schema["$defs"]["rigProfile"]["enum"]
    assert set(rig_profiles) == {
        "pixel-biped-axolotl",
        "pixel-biped-cat",
        "pixel-round-astronaut",
        "pixel-floating-orb",
        "pixel-hooded-mascot",
        "pixel-generic-biped",
    }


def test_all_pet_metadata_schemas_are_valid_draft_2020_12() -> None:
    for name in (
        "character-manifest.schema.json",
        "rig.schema.json",
        "animations.schema.json",
        "sprite-atlas.schema.json",
    ):
        schema = json.loads((SCHEMA_DIRECTORY / name).read_text(encoding="utf-8"))
        assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        Draft202012Validator.check_schema(schema)


def test_character_catalog_rejects_missing_default_character() -> None:
    existing_source = (
        "characters/vibespace-axolotl-pixel/archival/"
        "vibespace_axolotl_layer_manifest.json"
    )
    catalog = {
        "schemaVersion": 2,
        "defaultCharacterId": "missing",
        "characters": [
            {
                "id": "present",
                "displayName": "Present",
                "sources": [existing_source],
                "primarySource": existing_source,
                "renderMode": "pixel-sprite",
                "rigProfile": "pixel-generic-biped",
                "visualStyle": "pixel",
                "logoMode": "none",
                "capabilities": {},
            }
        ],
    }

    with pytest.raises(PackageValidationError, match="defaultCharacterId"):
        validate_character_catalog(catalog, CATALOG_PATH.parent)


def test_write_source_validation_report_is_machine_readable(tmp_path: Path) -> None:
    output = tmp_path / "source-package-validation.json"
    inventory = CHARACTER_ROOT / "archival" / "source-hashes.json"
    archive = CHARACTER_ROOT / "archival" / "vibespace_axolotl_layered_package.zip"

    document = write_source_validation_report(
        CHARACTER_ROOT,
        output,
        hash_inventory_path=inventory,
        archive_path=archive,
    )

    assert document["schemaVersion"] == 1
    assert document["status"] == "pass"
    assert document["validation"]["default_recomposition_exact"] is True
    assert document["normalization"]["sourceFileCount"] == 152
    assert document["normalization"]["duplicateHashGroupCount"] == 20
    assert document["normalization"]["canonicalArchiveEntryCount"] == 153
    assert document["normalization"]["canonicalArchiveSelfExcluded"] is True
    assert document["normalization"]["canonicalArchiveUnsafeEntryCount"] == 0
    assert document["normalization"]["canonicalArchiveDeterministicTimestamps"] is True
    assert json.loads(output.read_text(encoding="utf-8")) == document
