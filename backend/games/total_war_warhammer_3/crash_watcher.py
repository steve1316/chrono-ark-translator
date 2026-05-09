"""Watchdog-based crash watcher for Total War: Warhammer III.

Detects crashes via the `no_clean_exit` log marker, snapshots `crash_report/`,
`logs/`, and `preferences.script.txt` to `<helper_scripts_path>/../debugging/<id>/`,
and exposes list/notes/delete helpers consumed by the route layer.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend import config

_logger = logging.getLogger(__name__)


class CrashWatcherError(Exception):
    """Base for crash watcher errors."""


class WatcherDisabledError(CrashWatcherError):
    """Raised when APPDATA or TW3_HELPER_PATH are unset, so capture cannot proceed."""


class SnapshotNotFoundError(CrashWatcherError):
    """Raised when a requested snapshot id does not exist on disk."""


# Module-level state.
_capture_lock = threading.Lock()


def _appdata_wh3() -> Path:
    """Resolve `%APPDATA%/The Creative Assembly/Warhammer3/`.

    Raises:
        WatcherDisabledError: When APPDATA is unset (non-Windows host).

    Returns:
        Path to the Warhammer 3 user data directory.
    """
    raw = os.environ.get("APPDATA", "") or ""
    if not raw:
        raise WatcherDisabledError("APPDATA not set; not running on Windows")
    return Path(raw) / "The Creative Assembly" / "Warhammer3"


def _debugging_root() -> Path:
    """Resolve `<helper_scripts_path>/../debugging/`.

    Raises:
        WatcherDisabledError: When TW3_HELPER_PATH is unset.

    Returns:
        Path to the debugging snapshot root (parent of helper_scripts).
    """
    raw = config.TW3_HELPER_PATH or ""
    if not raw:
        raise WatcherDisabledError("TW3_HELPER_PATH not configured")
    return Path(raw).parent / "debugging"


def _free_folder_name(root: Path, base: str) -> Path:
    """Return `root/base`, suffixed with `-2`, `-3`, ... if it already exists.

    Args:
        root: Parent directory.
        base: Desired folder name.

    Returns:
        A path that does not yet exist on disk.
    """
    candidate = root / base
    suffix = 2
    while candidate.exists():
        candidate = root / f"{base}-{suffix}"
        suffix += 1
    return candidate


def _summarize_dir(path: Path) -> dict:
    """Compute file count and total bytes for a directory.

    Args:
        path: Directory to walk.

    Returns:
        `{"present": True, "file_count": N, "total_bytes": M}` if present, else
        `{"present": False, "file_count": 0, "total_bytes": 0}`.
    """
    if not path.is_dir():
        return {"present": False, "file_count": 0, "total_bytes": 0}
    file_count = 0
    total_bytes = 0
    for entry in path.rglob("*"):
        if entry.is_file():
            file_count += 1
            total_bytes += entry.stat().st_size
    return {"present": True, "file_count": file_count, "total_bytes": total_bytes}


def _summarize_file(path: Path) -> dict:
    """Single-file analog of `_summarize_dir`.

    Args:
        path: File path.

    Returns:
        `{"present": True, "total_bytes": N}` if present, else
        `{"present": False, "total_bytes": 0}`.
    """
    if not path.is_file():
        return {"present": False, "total_bytes": 0}
    return {"present": True, "total_bytes": path.stat().st_size}


def capture_snapshot(trigger: str = "manual") -> dict:
    """Snapshot the current crash artifacts to a fresh debugging folder.

    Args:
        trigger: `"watcher"` for live captures, `"manual"` for the route handler.

    Raises:
        WatcherDisabledError: When APPDATA or TW3_HELPER_PATH are unset.

    Returns:
        The manifest dict written to `<folder>/snapshot.json`.
    """
    wh3 = _appdata_wh3()
    debugging_root = _debugging_root()
    debugging_root.mkdir(parents=True, exist_ok=True)

    base = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")

    with _capture_lock:
        folder = _free_folder_name(debugging_root, base)
        folder.mkdir(parents=True)

        crash_src = wh3 / "crash_report"
        logs_src = wh3 / "logs"
        prefs_src = wh3 / "preferences.script.txt"

        if crash_src.is_dir():
            shutil.copytree(crash_src, folder / "crash_report", dirs_exist_ok=False)
        else:
            _logger.warning("crash_report/ missing at %s", crash_src)

        if logs_src.is_dir():
            shutil.copytree(logs_src, folder / "logs", dirs_exist_ok=False)
        else:
            _logger.warning("logs/ missing at %s", logs_src)

        if prefs_src.is_file():
            shutil.copy2(prefs_src, folder / "preferences.script.txt")

        manifest: dict[str, Any] = {
            "id": folder.name,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "trigger": trigger,
            "source": str(wh3),
            "files": {
                "crash_report": _summarize_dir(folder / "crash_report"),
                "logs": _summarize_dir(folder / "logs"),
                "preferences.script.txt": _summarize_file(folder / "preferences.script.txt"),
            },
            "notes": "",
        }
        (folder / "snapshot.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest


def list_snapshots() -> list[dict]:
    """Return all manifests under the debugging root, newest first.

    Raises:
        WatcherDisabledError: When TW3_HELPER_PATH is unset.

    Returns:
        List of manifest dicts ordered by `captured_at` descending.
    """
    root = _debugging_root()
    if not root.is_dir():
        return []
    snapshots: list[dict] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        manifest_path = child / "snapshot.json"
        if not manifest_path.is_file():
            continue
        try:
            snapshots.append(json.loads(manifest_path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError) as exc:
            _logger.warning("skipping unreadable snapshot %s: %s", child.name, exc)
    snapshots.sort(key=lambda m: m.get("captured_at", ""), reverse=True)
    return snapshots


def update_notes(snapshot_id: str, notes: str) -> dict:
    """Read-modify-write the `notes` field of `<id>/snapshot.json`.

    Args:
        snapshot_id: Folder name returned by `capture_snapshot()`.
        notes: New notes text (last-write-wins).

    Raises:
        SnapshotNotFoundError: When the snapshot does not exist.
        WatcherDisabledError: When TW3_HELPER_PATH is unset.

    Returns:
        The updated manifest dict.
    """
    folder = _debugging_root() / snapshot_id
    manifest_path = folder / "snapshot.json"
    if not manifest_path.is_file():
        raise SnapshotNotFoundError(snapshot_id)
    with _capture_lock:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["notes"] = notes
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def delete_snapshot(snapshot_id: str) -> None:
    """Remove `<debugging_root>/<id>/`.

    Args:
        snapshot_id: Folder name returned by `capture_snapshot()`.

    Raises:
        SnapshotNotFoundError: When the folder does not exist.
        WatcherDisabledError: When TW3_HELPER_PATH is unset.
    """
    folder = _debugging_root() / snapshot_id
    if not folder.is_dir():
        raise SnapshotNotFoundError(snapshot_id)
    shutil.rmtree(folder)
