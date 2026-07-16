"""Path containment helpers for local Pet asset processing."""

from pathlib import Path, PurePosixPath, PureWindowsPath


class PathSafetyError(ValueError):
    """Raised when a package path escapes its declared root."""


def resolve_under(root: Path, relative_path: str) -> Path:
    if not isinstance(relative_path, str) or not relative_path or "\x00" in relative_path:
        raise PathSafetyError("package path must be a non-empty string")

    windows_path = PureWindowsPath(relative_path)
    posix_path = PurePosixPath(relative_path.replace("\\", "/"))
    if windows_path.is_absolute() or windows_path.drive or posix_path.is_absolute():
        raise PathSafetyError("absolute package paths are not allowed")
    if any(part in {"", ".", ".."} for part in posix_path.parts):
        raise PathSafetyError("package path contains an unsafe segment")

    resolved_root = root.resolve()
    resolved = (resolved_root / Path(*posix_path.parts)).resolve()
    if not resolved.is_relative_to(resolved_root):
        raise PathSafetyError("package path escapes its declared root")
    return resolved
