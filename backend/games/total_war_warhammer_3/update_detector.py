"""TW3 mod update detector. Pure functions over (mods, baseline)."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TypedDict

# Package names excluded from update detection because they don't track Steam Workshop updates
# (e.g. the "vanilla" entry points at the game's base files which Steam Workshop doesn't update).
_EXCLUDED_PACKAGE_NAMES = frozenset({"vanilla"})

_HASH_PREFIX = "sha256:"
_HASH_CHUNK_BYTES = 1024 * 1024  # 1 MB chunked read.


class StaleMod(TypedDict):
    """A mod whose `.pack` file is newer than the stored baseline mtime.

    Fields:
        package_name: Stable identity of the mod.
        mod_name: Display name from the `name` field of `SUPPORTED_MODS`.
        path: Filesystem path of the `.pack` file.
        current_mtime: Current mtime in Unix epoch seconds.
        baseline_mtime: Stored baseline mtime from the last sync.
        delta_seconds: `current_mtime - baseline_mtime`.
    """

    package_name: str
    mod_name: str
    path: str
    current_mtime: float
    baseline_mtime: float
    delta_seconds: float


def _sha256_file(path: str) -> str | None:
    """Return the SHA-256 of `path` as `sha256:<hex>`, or `None` if unreadable.

    Reads the file in 1 MB chunks so multi-GB packs do not pin memory.

    Args:
        path: Filesystem path to a `.pack` file.

    Returns:
        The hash string prefixed with `sha256:`, or `None` if the file cannot be opened or read.
    """
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as fh:
            while True:
                chunk = fh.read(_HASH_CHUNK_BYTES)
                if not chunk:
                    break
                digest.update(chunk)
    except OSError:
        return None
    return f"{_HASH_PREFIX}{digest.hexdigest()}"


def _safe_mtime(path: str) -> float | None:
    """Return the mtime of `path` in Unix epoch seconds, or None if unreadable.

    Args:
        path: Filesystem path to stat.

    Returns:
        The `st_mtime` of the file, or None if an OSError is raised.
    """
    try:
        return Path(path).stat().st_mtime
    except OSError:
        return None


def detect_updates(mods: list[dict], baseline: dict[str, float | None]) -> list[StaleMod]:
    """Return mods whose `.pack` file is newer than the stored baseline mtime.

    Skips mods missing `package_name` or `path`, mods with no or None baseline entry,
    and mods whose path cannot be stat'd. Results are sorted by `delta_seconds` descending.

    Args:
        mods: List of mod dicts, each expected to have `package_name`, `path`, and `name` keys.
        baseline: Map of `package_name` to the last-known mtime (or None if never recorded).

    Returns:
        A list of `StaleMod` dicts sorted by `delta_seconds` descending.
    """
    stale: list[StaleMod] = []

    for mod in mods:
        package_name = mod.get("package_name")
        path = mod.get("path")
        if package_name is None or path is None:
            continue
        if package_name in _EXCLUDED_PACKAGE_NAMES:
            continue

        baseline_mtime = baseline.get(package_name)
        if baseline_mtime is None:
            continue

        current_mtime = _safe_mtime(path)
        if current_mtime is None:
            continue

        if current_mtime > baseline_mtime:
            stale.append(
                StaleMod(
                    package_name=package_name,
                    mod_name=mod.get("name", ""),
                    path=path,
                    current_mtime=current_mtime,
                    baseline_mtime=baseline_mtime,
                    delta_seconds=current_mtime - baseline_mtime,
                )
            )

    stale.sort(key=lambda s: s["delta_seconds"], reverse=True)
    return stale


def current_mtimes(mods: list[dict]) -> dict[str, float | None]:
    """Walk `mods` once and return a dict mapping `package_name` to the current mtime.

    Mods missing `package_name` or `path` are excluded from the result entirely.

    Args:
        mods: List of mod dicts, each expected to have `package_name` and `path` keys.

    Returns:
        A dict of `{package_name: mtime_or_None}` for every mod that has both keys.
    """
    result: dict[str, float | None] = {}
    for mod in mods:
        package_name = mod.get("package_name")
        path = mod.get("path")
        if package_name is None or path is None:
            continue
        if package_name in _EXCLUDED_PACKAGE_NAMES:
            continue
        result[package_name] = _safe_mtime(path)
    return result
