"""Deterministic package hashing and archive creation."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import zipfile


def collect_source_hashes(root: Path, *, exclude: set[Path] | None = None) -> dict[str, str]:
    resolved_root = root.resolve()
    excluded = {path.resolve() for path in (exclude or set())}
    result: dict[str, str] = {}
    for path in sorted(resolved_root.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise ValueError(f"source package contains a symlink: {path}")
        if not path.is_file() or path.resolve() in excluded:
            continue
        relative = path.relative_to(resolved_root).as_posix()
        result[relative] = _sha256(path)
    return result


def write_source_hash_inventory(
    character_root: Path,
    output_path: Path,
    *,
    archive_output: Path,
) -> dict[str, object]:
    output = output_path.resolve()
    archive = archive_output.resolve()
    files = collect_source_hashes(character_root, exclude={output, archive})
    document: dict[str, object] = {
        "schemaVersion": 1,
        "hashAlgorithm": "sha256",
        "files": files,
    }
    write_json_atomic(output, document)
    return document


def create_complete_package_zip(character_root: Path, output_path: Path) -> str:
    root = character_root.resolve()
    output = output_path.resolve()
    if not output.is_relative_to(root):
        raise ValueError("package archive output must stay inside the character root")
    output.parent.mkdir(parents=True, exist_ok=True)
    files = [
        path
        for path in sorted(root.rglob("*"), key=lambda item: item.as_posix())
        if path.is_file() and path.resolve() != output
    ]
    if any(path.is_symlink() for path in files):
        raise ValueError("source package archive cannot contain symlinks")
    if any(path.stat().st_size > 256 * 1024 * 1024 for path in files):
        raise ValueError("source package contains a file larger than 256 MiB")
    if sum(path.stat().st_size for path in files) > 1024 * 1024 * 1024:
        raise ValueError("source package exceeds the 1 GiB archive limit")

    handle = tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    )
    temp_path = Path(handle.name)
    handle.close()
    try:
        with zipfile.ZipFile(
            temp_path,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for path in files:
                relative = path.relative_to(root).as_posix()
                info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compresslevel=9)
        with temp_path.open("r+b") as stream:
            os.fsync(stream.fileno())
        os.replace(temp_path, output)
    finally:
        temp_path.unlink(missing_ok=True)
    return _sha256(output)


def write_json_atomic(output_path: Path, document: object) -> None:
    output = output_path.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    )
    temp_path = Path(handle.name)
    try:
        with handle:
            json.dump(document, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, output)
    finally:
        temp_path.unlink(missing_ok=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character-root", type=Path, required=True)
    parser.add_argument("--hash-inventory", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args(argv)
    inventory = write_source_hash_inventory(
        args.character_root,
        args.hash_inventory,
        archive_output=args.archive,
    )
    archive_sha256 = create_complete_package_zip(args.character_root, args.archive)
    print(
        json.dumps(
            {
                "archive": str(args.archive),
                "archiveSha256": archive_sha256,
                "sourceFileCount": len(inventory["files"]),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
