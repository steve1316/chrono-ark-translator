"""HTTP routes for TW3 mod update detection."""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsLoaderError,
    HelperScriptsNotConfiguredError,
    RegistryFileMissingError,
    load_supported_mods,
)
from backend.games.total_war_warhammer_3.routes._paths import helper_scripts_path
from backend.games.total_war_warhammer_3.update_detector import (
    BaselineEntry,
    current_baseline,
    detect_updates,
)

router = APIRouter()

# Default baseline paths. Tests monkeypatch these to redirect storage.
_STORAGE_DIR = Path(__file__).resolve().parents[3] / "storage" / "games" / "total_war_warhammer_3"
_BASELINE_PATH = _STORAGE_DIR / "mod_baseline.json"
_LEGACY_BASELINE_PATH = _STORAGE_DIR / "mod_mtimes.json"

# Module-level lock so simultaneous /updates polls and /updates/sync calls don't race the baseline file.
_LOCK = threading.Lock()


def _read_baseline() -> tuple[dict[str, BaselineEntry], bool]:
    """Read the new-format baseline file.

    Returns:
        `(baseline_dict, exists_and_parsed)`. `(_, True)` on a successful parse of the new schema.
        `({}, False)` when the file is missing, malformed, or in the legacy flat format.
    """
    if not _BASELINE_PATH.exists():
        return {}, False
    try:
        with _BASELINE_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}, False
    if not isinstance(data, dict):
        return {}, False
    # Legacy detection: any scalar value means this is the old mtime-only format.
    if any(not isinstance(v, dict) for v in data.values()):
        return {}, False
    return data, True


def _write_baseline_atomic(baseline: dict[str, BaselineEntry]) -> None:
    """Write the baseline atomically via tmp + rename.

    Args:
        baseline: Dict of `{package_name: BaselineEntry}`.

    Raises:
        OSError: When the atomic rename fails.
    """
    _BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = _BASELINE_PATH.with_suffix(_BASELINE_PATH.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        json.dump(baseline, fh, indent=2)
    os.replace(tmp_path, _BASELINE_PATH)


def _delete_legacy_baseline_if_present() -> None:
    """Remove the legacy `mod_mtimes.json` if it exists. Errors are swallowed (best-effort cleanup)."""
    try:
        if _LEGACY_BASELINE_PATH.exists():
            _LEGACY_BASELINE_PATH.unlink()
    except OSError:
        pass


def _load_mods_or_raise() -> list[dict]:
    """Load `SUPPORTED_MODS` or raise an HTTPException with the right status code.

    Returns:
        The loaded mod list.

    Raises:
        HTTPException(503): When `TW3_HELPER_PATH` is unset or `supported_mods.py` is missing.
        HTTPException(500): When the source file fails to load.
    """
    try:
        return load_supported_mods(helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"Registry unavailable: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/updates")
def get_updates() -> dict[str, Any]:
    """Return the mod update report.

    On the first call after deploy (or when the legacy flat baseline is present), runs
    a full backfill: computes mtime + SHA-256 for every mod, writes the new baseline,
    deletes the legacy file, and returns an empty `stale` list with `baseline_exists: false`.

    In steady state, uses mtime as a cheap pre-filter. Only hashes mods whose mtime
    has drifted. mtime-only drifts (bytes identical) are silently re-baselined.

    Returns:
        `{"stale": [...], "baseline_exists": bool, "baseline_path": str, "total_known": int}`.

    Raises:
        HTTPException(503): When helper_scripts is unset or missing.
        HTTPException(500): When loading mods or writing baseline fails.
    """
    with _LOCK:
        mods = _load_mods_or_raise()
        baseline, exists = _read_baseline()
        if not exists:
            baseline = current_baseline(mods)
            try:
                _write_baseline_atomic(baseline)
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"Failed to write baseline: {exc}")
            _delete_legacy_baseline_if_present()
            return {
                "stale": [],
                "baseline_exists": False,
                "baseline_path": str(_BASELINE_PATH),
                "total_known": len(mods),
            }

        stale, refreshed = detect_updates(mods, baseline)
        if refreshed != baseline:
            try:
                _write_baseline_atomic(refreshed)
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"Failed to write baseline: {exc}")

        return {
            "stale": stale,
            "baseline_exists": True,
            "baseline_path": str(_BASELINE_PATH),
            "total_known": len(mods),
        }


@router.post("/updates/sync")
def post_updates_sync() -> dict[str, Any]:
    """Capture current mtimes + hashes as the new baseline.

    Prunes orphan entries (mods removed from `SUPPORTED_MODS` since last sync) and
    includes new entries with freshly computed hashes.

    Returns:
        `{"synced_at": str, "count": int, "baseline_path": str}` on success.

    Raises:
        HTTPException(503): When helper_scripts is unset or missing.
        HTTPException(500): When loading mods or writing baseline fails.
    """
    with _LOCK:
        mods = _load_mods_or_raise()
        baseline = current_baseline(mods)
        try:
            _write_baseline_atomic(baseline)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to write baseline: {exc}")
        _delete_legacy_baseline_if_present()
        return {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "count": len(baseline),
            "baseline_path": str(_BASELINE_PATH),
        }
