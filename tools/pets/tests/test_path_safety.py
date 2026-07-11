from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pets_pipeline.path_safety import PathSafetyError, resolve_under


def test_resolve_under_accepts_normal_relative_path(tmp_path: Path) -> None:
    resolved = resolve_under(tmp_path, "layers/body.png")

    assert resolved == tmp_path.resolve() / "layers" / "body.png"


@pytest.mark.parametrize(
    "candidate",
    ["../secret.txt", "layers/../../secret.txt", "/absolute.png", "C:/escape.png", "C:\\escape.png"],
)
def test_resolve_under_rejects_traversal_and_absolute_paths(
    tmp_path: Path,
    candidate: str,
) -> None:
    with pytest.raises(PathSafetyError):
        resolve_under(tmp_path, candidate)


def test_resolve_under_rejects_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / "outside"
    outside.mkdir(exist_ok=True)
    link = tmp_path / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is unavailable in this environment")

    with pytest.raises(PathSafetyError):
        resolve_under(tmp_path, "linked/asset.png")
