"""Cross-format validation for the immutable Axolotl package."""

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import zipfile

from jsonschema import Draft202012Validator
from PIL import Image, ImageChops

from .images import ImageValidationError, inspect_png
from .models import ManifestValidation, SourceValidationReport
from .normalize_package_layout import write_json_atomic
from .ora import OraValidationError, inspect_ora
from .path_safety import PathSafetyError, resolve_under
from .psd import PsdValidationError, inspect_psd


class PackageValidationError(ValueError):
    """Raised when package invariants are not satisfied."""


SUPPORTED_RIG_PROFILES = frozenset(
    {
        "pixel-biped-axolotl",
        "pixel-biped-cat",
        "pixel-round-astronaut",
        "pixel-floating-orb",
        "pixel-hooded-mascot",
        "pixel-generic-biped",
    }
)


ANATOMY_UNDERLAP_IDS = (
    "helmet_back",
    "tail_root_underlap",
    "left_gill_upper_attachment",
    "left_gill_middle_attachment",
    "left_gill_lower_attachment",
    "right_gill_upper_attachment",
    "right_gill_middle_attachment",
    "right_gill_lower_attachment",
    "left_leg_underlap",
    "right_leg_underlap",
    "left_upper_arm_underlap",
    "right_upper_arm_underlap",
    "left_hand_underlap",
    "right_hand_underlap",
    "helmet_under_face_trim",
    "torso_behind_arms",
    "lower_body_behind_hoodie",
)


def validate_character_catalog(document: dict, catalog_root: Path) -> None:
    """Validate catalog-level identity, supported rigs, and source references."""
    if document.get("schemaVersion") != 2:
        raise PackageValidationError("character catalog schemaVersion must be 2")
    characters = document.get("characters")
    default_id = document.get("defaultCharacterId")
    if not isinstance(characters, list) or not characters:
        raise PackageValidationError("character catalog must contain characters")
    if not isinstance(default_id, str) or not default_id:
        raise PackageValidationError("character catalog defaultCharacterId is invalid")

    ids: set[str] = set()
    for character in characters:
        if not isinstance(character, dict) or not isinstance(character.get("id"), str):
            raise PackageValidationError("character catalog contains an invalid character")
        character_id = character["id"]
        if character_id in ids:
            raise PackageValidationError(f"duplicate character id: {character_id}")
        ids.add(character_id)
        rig_profile = character.get("rigProfile")
        if rig_profile not in SUPPORTED_RIG_PROFILES:
            raise PackageValidationError(f"unsupported rigProfile: {rig_profile}")
        sources = character.get("sources")
        primary = character.get("primarySource")
        if not isinstance(sources, list) or not sources or primary not in sources:
            raise PackageValidationError(
                f"primarySource must be present in sources: {character_id}"
            )
        for source in sources:
            if not isinstance(source, str):
                raise PackageValidationError(f"invalid source path: {character_id}")
            try:
                source_path = resolve_under(catalog_root, source)
            except PathSafetyError as exc:
                raise PackageValidationError(
                    f"unsafe source path for {character_id}: {exc}"
                ) from exc
            if not source_path.is_file():
                raise PackageValidationError(
                    f"missing source file for {character_id}: {source}"
                )
    if default_id not in ids:
        raise PackageValidationError("defaultCharacterId does not identify a character")


def validate_manifest_document(
    document: dict,
    character_root: Path,
) -> ManifestValidation:
    layers = document.get("layers")
    canvas = document.get("canvas")
    pivots = document.get("pivots")
    if not isinstance(layers, list) or not isinstance(canvas, dict) or not isinstance(pivots, list):
        raise PackageValidationError("manifest is missing layers, canvas, or pivots")
    try:
        width = int(canvas["width"])
        height = int(canvas["height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise PackageValidationError("manifest canvas dimensions are invalid") from exc
    if width <= 0 or height <= 0 or width * height > 20_000_000:
        raise PackageValidationError("manifest canvas exceeds validation limits")

    ids: list[str] = []
    paths: list[str] = []
    missing: list[str] = []
    empty: list[str] = []
    layer_by_id: dict[str, dict] = {}
    for layer in layers:
        if not isinstance(layer, dict) or not isinstance(layer.get("id"), str):
            raise PackageValidationError("manifest layer has an invalid id")
        layer_id = layer["id"]
        if layer_id in layer_by_id:
            raise PackageValidationError(f"duplicate layer id: {layer_id}")
        layer_by_id[layer_id] = layer
        ids.append(layer_id)
        relative = layer.get("file")
        if not isinstance(relative, str):
            raise PackageValidationError(f"layer file path is invalid: {layer_id}")
        if relative in paths:
            raise PackageValidationError(f"duplicate layer path: {relative}")
        paths.append(relative)
        try:
            layer_path = resolve_under(character_root, relative)
        except PathSafetyError as exc:
            raise PackageValidationError(f"unsafe layer path for {layer_id}: {exc}") from exc
        if not layer_path.is_file():
            missing.append(relative)
            continue
        try:
            info = inspect_png(layer_path, max_pixels=20_000_000)
        except ImageValidationError as exc:
            raise PackageValidationError(f"invalid layer image {layer_id}: {exc}") from exc
        if (info.width, info.height) != (width, height):
            raise PackageValidationError(f"layer dimensions do not match canvas: {layer_id}")
        if info.nontransparent_pixels == 0:
            empty.append(layer_id)
    if missing:
        raise PackageValidationError(f"missing layer file: {missing[0]}")

    pivot_names: set[str] = set()
    invalid_pivots: list[str] = []
    invalid_references: list[str] = []
    for pivot in pivots:
        if not isinstance(pivot, dict) or not isinstance(pivot.get("name"), str):
            raise PackageValidationError("manifest pivot has an invalid name")
        name = pivot["name"]
        if name in pivot_names:
            invalid_pivots.append(name)
        pivot_names.add(name)
        x = pivot.get("xPixels")
        y = pivot.get("yPixels")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or not (
            0 <= x < width and 0 <= y < height
        ):
            invalid_pivots.append(name)
        parent = pivot.get("parentLayer")
        if parent is not None and parent not in layer_by_id:
            invalid_references.append(f"pivot:{name}:parentLayer:{parent}")
    for layer in layers:
        pivot = layer.get("pivot")
        if pivot is not None and pivot not in pivot_names:
            invalid_references.append(f"layer:{layer['id']}:pivot:{pivot}")

    branding = [layer for layer in layers if layer.get("branding") is True]
    default_expression = str(document.get("expressions", {}).get("activeDefault", ""))
    happy_layers = [layer for layer in layers if layer["id"].startswith("happy__")]
    group_visibility = document.get("groupVisibility", {})
    underlaps = tuple(layer_id for layer_id in ANATOMY_UNDERLAP_IDS if layer_id in layer_by_id)
    return ManifestValidation(
        character_id=str(document.get("characterId", "")),
        canvas=(width, height),
        layer_count=len(layers),
        unique_layer_ids=len(ids) == len(set(ids)),
        unique_layer_paths=len(paths) == len(set(paths)),
        missing_layer_files=tuple(missing),
        empty_layer_ids=tuple(empty),
        invalid_pivot_ids=tuple(sorted(set(invalid_pivots))),
        invalid_pivot_references=tuple(invalid_references),
        branding_all_non_mirrorable=bool(branding)
        and all(layer.get("mirrorAllowed") is False for layer in branding),
        default_expression=default_expression,
        happy_expression_is_source_extracted=bool(happy_layers)
        and all(layer.get("reconstructedPixels") is False for layer in happy_layers),
        guide_and_reference_groups_hidden=(
            group_visibility.get("00_GUIDES") is False
            and group_visibility.get("11_REFERENCE") is False
        ),
        anatomy_underlap_ids=underlaps,
    )


def validate_character_source(character_root: Path) -> SourceValidationReport:
    archival = character_root / "archival"
    manifest_path = archival / "vibespace_axolotl_layer_manifest.json"
    try:
        if manifest_path.stat().st_size > 2 * 1024 * 1024:
            raise PackageValidationError("manifest exceeds the 2 MiB limit")
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageValidationError(f"manifest is unreadable: {exc}") from exc

    manifest = validate_manifest_document(document, character_root)
    try:
        psd = inspect_psd(archival / "vibespace_axolotl_animation_rig.psd")
        ora = inspect_ora(archival / "vibespace_axolotl_animation_rig.ora")
    except (PsdValidationError, OraValidationError) as exc:
        raise PackageValidationError(str(exc)) from exc
    if psd.leaf_layer_count != manifest.layer_count or ora.leaf_layer_count != manifest.layer_count:
        raise PackageValidationError("PSD/ORA/manifest layer counts disagree")
    if psd.group_count != ora.group_count:
        raise PackageValidationError("PSD and ORA group counts disagree")
    if len(manifest.anatomy_underlap_ids) != len(ANATOMY_UNDERLAP_IDS):
        raise PackageValidationError("required reconstructed anatomy underlaps are missing")

    preview_path = character_root / "previews" / "vibespace_axolotl_preview_transparent.png"
    preview_info = inspect_png(preview_path, max_pixels=20_000_000)
    recomposed = _recompose_visible_layers(document, character_root, manifest.canvas)
    with Image.open(preview_path) as source_preview:
        preview = source_preview.convert("RGBA")
        preview.load()
    exact = ImageChops.difference(recomposed, preview).getbbox() is None

    return SourceValidationReport(
        character_id=manifest.character_id,
        canvas=manifest.canvas,
        psd=psd,
        ora=ora,
        manifest_layer_count=manifest.layer_count,
        unique_layer_ids=manifest.unique_layer_ids,
        unique_layer_paths=manifest.unique_layer_paths,
        missing_layer_files=manifest.missing_layer_files,
        empty_layer_ids=manifest.empty_layer_ids,
        invalid_pivot_ids=manifest.invalid_pivot_ids,
        invalid_pivot_references=manifest.invalid_pivot_references,
        branding_all_non_mirrorable=manifest.branding_all_non_mirrorable,
        default_recomposition_exact=exact,
        default_expression=manifest.default_expression,
        happy_expression_is_source_extracted=manifest.happy_expression_is_source_extracted,
        guide_and_reference_groups_hidden=manifest.guide_and_reference_groups_hidden,
        anatomy_underlap_ids=manifest.anatomy_underlap_ids,
        preview_alpha=preview_info.alpha,
    )


def write_source_validation_report(
    character_root: Path,
    output_path: Path,
    *,
    hash_inventory_path: Path | None = None,
    archive_path: Path | None = None,
) -> dict[str, object]:
    report = validate_character_source(character_root)
    validation = json.loads(json.dumps(report.to_dict()))
    document: dict[str, object] = {
        "schemaVersion": 1,
        "status": "pass",
        "validation": validation,
    }
    if (hash_inventory_path is None) != (archive_path is None):
        raise PackageValidationError(
            "hash inventory and canonical archive must be validated together"
        )
    if hash_inventory_path is not None and archive_path is not None:
        document["normalization"] = _validate_normalized_package(
            character_root,
            hash_inventory_path,
            archive_path,
        )
    write_json_atomic(output_path, document)
    return document


def _validate_normalized_package(
    character_root: Path,
    hash_inventory_path: Path,
    archive_path: Path,
) -> dict[str, object]:
    try:
        inventory_file = resolve_under(
            character_root,
            hash_inventory_path.resolve().relative_to(character_root.resolve()).as_posix(),
        )
        canonical_archive = resolve_under(
            character_root,
            archive_path.resolve().relative_to(character_root.resolve()).as_posix(),
        )
    except (PathSafetyError, ValueError) as exc:
        raise PackageValidationError("normalization outputs must stay inside character root") from exc
    if inventory_file.stat().st_size > 2 * 1024 * 1024:
        raise PackageValidationError("source hash inventory exceeds the 2 MiB limit")
    try:
        inventory = json.loads(inventory_file.read_text(encoding="utf-8"))
        hashes = inventory["files"]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as exc:
        raise PackageValidationError("source hash inventory is invalid") from exc
    if inventory.get("schemaVersion") != 1 or inventory.get("hashAlgorithm") != "sha256":
        raise PackageValidationError("source hash inventory metadata is invalid")
    if not isinstance(hashes, dict) or not hashes:
        raise PackageValidationError("source hash inventory has no files")

    by_digest: defaultdict[str, list[str]] = defaultdict(list)
    for relative, expected in hashes.items():
        if not isinstance(relative, str) or not isinstance(expected, str) or len(expected) != 64:
            raise PackageValidationError("source hash inventory contains an invalid entry")
        try:
            source = resolve_under(character_root, relative)
        except PathSafetyError as exc:
            raise PackageValidationError(f"unsafe source hash path: {relative}") from exc
        if not source.is_file() or _sha256(source) != expected:
            raise PackageValidationError(f"source hash mismatch: {relative}")
        by_digest[expected].append(relative)

    try:
        with zipfile.ZipFile(canonical_archive) as archive:
            names = archive.namelist()
            bad_member = archive.testzip()
            unsafe_entries = [
                name
                for name in names
                if Path(name).is_absolute()
                or ".." in name.replace("\\", "/").split("/")
                or "\\" in name
            ]
            expected_names = set(hashes) | {
                inventory_file.relative_to(character_root.resolve()).as_posix()
            }
            if set(names) != expected_names or len(names) != len(expected_names):
                raise PackageValidationError("canonical archive entries do not match source inventory")
            if bad_member is not None:
                raise PackageValidationError(f"canonical archive has a corrupt entry: {bad_member}")
            deterministic_timestamps = all(
                info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist()
            )
    except (OSError, zipfile.BadZipFile) as exc:
        raise PackageValidationError("canonical archive is invalid") from exc

    duplicates = sorted(
        (sorted(paths) for paths in by_digest.values() if len(paths) > 1),
        key=lambda paths: (-len(paths), paths),
    )
    return {
        "sourceHashAlgorithm": "sha256",
        "sourceFileCount": len(hashes),
        "duplicateHashGroupCount": len(duplicates),
        "duplicateHashGroups": duplicates,
        "canonicalArchiveSha256": _sha256(canonical_archive),
        "canonicalArchiveEntryCount": len(names),
        "canonicalArchiveSelfExcluded": (
            canonical_archive.relative_to(character_root.resolve()).as_posix() not in names
        ),
        "canonicalArchiveUnsafeEntryCount": len(unsafe_entries),
        "canonicalArchiveDeterministicTimestamps": deterministic_timestamps,
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _recompose_visible_layers(
    document: dict,
    character_root: Path,
    canvas: tuple[int, int],
) -> Image.Image:
    by_id = {layer["id"]: layer for layer in document["layers"]}
    result = Image.new("RGBA", canvas, (0, 0, 0, 0))
    for layer_id in document.get("layerOrder", []):
        layer = by_id.get(layer_id)
        if layer is None:
            raise PackageValidationError(f"layerOrder references unknown layer: {layer_id}")
        if layer.get("visible") is not True:
            continue
        path = resolve_under(character_root, layer["file"])
        with Image.open(path) as image:
            frame = image.convert("RGBA")
            frame.load()
        result = Image.alpha_composite(result, frame)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character-root", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--catalog-schema", type=Path, required=True)
    parser.add_argument("--hash-inventory", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    schema = json.loads(args.catalog_schema.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(catalog)
    validate_character_catalog(catalog, args.catalog.parent)
    document = write_source_validation_report(
        args.character_root,
        args.output,
        hash_inventory_path=args.hash_inventory,
        archive_path=args.archive,
    )
    print(
        json.dumps(
            {
                "characterId": document["validation"]["character_id"],
                "output": str(args.output),
                "status": document["status"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
