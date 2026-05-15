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


class BaselineEntry(TypedDict):
    """One entry in the on-disk baseline.

    Fields:
        mtime: Last-known mtime in Unix epoch seconds, or `None` if the file was unreadable
            when the baseline was captured.
        hash: SHA-256 of the file content as `sha256:<hex>`, or `None` if unreadable or
            never captured yet.
    """

    mtime: float | None
    hash: str | None


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


def detect_updates(
    mods: list[dict],
    baseline: dict[str, BaselineEntry],
) -> tuple[list[StaleMod], dict[str, BaselineEntry]]:
    """Return `(stale_list, refreshed_baseline)` after a hybrid mtime+hash scan.

    mtime is the cheap pre-filter. When a mod's current mtime equals the stored mtime,
    no hash is computed. When mtime differs, the file is hashed:
      - If the new hash matches the baseline hash, the entry is silently re-baselined
        (mtime updated, mod NOT in stale list).
      - If the new hash differs, the mod is added to the stale list and the baseline
        is left intact for that mod (the user must call sync to acknowledge).

    Args:
        mods: List of mod dicts with `name`, `package_name`, `path`.
        baseline: Map of `package_name` to `BaselineEntry`.

    Returns:
        `(stale, refreshed_baseline)`. `refreshed_baseline` is a NEW dict, never the
        same reference as the input. Callers can compare references or check for
        per-entry mtime drift to decide whether to write to disk.
    """
    stale: list[StaleMod] = []
    refreshed: dict[str, BaselineEntry] = dict(baseline)

    for mod in mods:
        package_name = mod.get("package_name")
        path = mod.get("path")
        if package_name is None or path is None:
            continue
        if package_name in _EXCLUDED_PACKAGE_NAMES:
            continue

        cur_mtime = _safe_mtime(path)
        if cur_mtime is None:
            continue

        entry = refreshed.get(package_name)
        if entry is None or entry.get("mtime") is None:
            # New mod or previously unreadable - silently capture and continue.
            cur_hash = _sha256_file(path)
            refreshed[package_name] = {"mtime": cur_mtime, "hash": cur_hash}
            continue

        if cur_mtime == entry["mtime"]:
            continue  # Cheap path.

        cur_hash = _sha256_file(path)
        if cur_hash is None:
            continue  # Unreadable mid-scan, skip.

        if cur_hash == entry["hash"]:
            refreshed[package_name] = {"mtime": cur_mtime, "hash": entry["hash"]}
            continue

        # Truly different bytes.
        stale.append(
            StaleMod(
                package_name=package_name,
                mod_name=mod.get("name", ""),
                path=path,
                current_mtime=cur_mtime,
                baseline_mtime=entry["mtime"],
                delta_seconds=cur_mtime - entry["mtime"],
            )
        )

    stale.sort(key=lambda s: s["delta_seconds"], reverse=True)
    return stale, refreshed


def current_baseline(mods: list[dict]) -> dict[str, BaselineEntry]:
    """Walk `mods` once and return a `{package_name: BaselineEntry}` dict.

    Mods missing `package_name` or `path` are excluded entirely. Excluded package
    names (e.g. `vanilla`) are also omitted.

    Args:
        mods: List of mod dicts, each expected to have `package_name` and `path` keys.

    Returns:
        A dict mapping `package_name` to `{mtime, hash}` for every eligible mod.
    """
    result: dict[str, BaselineEntry] = {}
    for mod in mods:
        package_name = mod.get("package_name")
        path = mod.get("path")
        if package_name is None or path is None:
            continue
        if package_name in _EXCLUDED_PACKAGE_NAMES:
            continue
        mtime = _safe_mtime(path)
        file_hash = _sha256_file(path) if mtime is not None else None
        result[package_name] = {"mtime": mtime, "hash": file_hash}
    return result
