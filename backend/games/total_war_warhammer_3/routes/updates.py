"""HTTP routes for TW3 mod update detection."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsLoaderError,
    HelperScriptsNotConfiguredError,
    RegistryFileMissingError,
    load_supported_mods,
)
from backend.games.total_war_warhammer_3.routes._paths import helper_scripts_path
from backend.games.total_war_warhammer_3.update_detector import (
    current_mtimes,
    detect_updates,
)

router = APIRouter()

# Default baseline path; tests monkeypatch this attribute to redirect storage.
_BASELINE_PATH = Path("backend/storage/games/total_war_warhammer_3/mod_mtimes.json")


def _read_baseline() -> tuple[dict[str, float | None], bool]:
    """Read the baseline file. Returns `(baseline_dict, exists_and_parsed)`.

    Returns:
        `(baseline, True)` on successful read of valid JSON. `({}, False)` when
        the file is missing or parse fails (caller treats both as first-run).
    """
    if not _BASELINE_PATH.exists():
        return {}, False
    try:
        with _BASELINE_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return {}, False
        return data, True
    except (OSError, json.JSONDecodeError):
        return {}, False


def _write_baseline_atomic(baseline: dict[str, float | None]) -> None:
    """Write the baseline atomically via tmp + rename.

    Args:
        baseline: Dict of `{package_name: mtime_or_None}`.
    """
    _BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = _BASELINE_PATH.with_suffix(_BASELINE_PATH.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        json.dump(baseline, fh, indent=2)
    os.replace(tmp_path, _BASELINE_PATH)


@router.get("/updates")
def get_updates():
    """Return the mod update report.

    On first run (baseline file missing or corrupt) the handler writes the current
    mtimes as the baseline and returns an empty `stale` list with `baseline_exists: false`.

    Returns:
        `{"stale": [...], "baseline_exists": bool, "baseline_path": str, "total_known": int}` on success.

    Raises:
        HTTPException(503): When `TW3_HELPER_PATH` is unset or `supported_mods.py` is missing.
        HTTPException(500): When the source file fails to load.
    """
    try:
        mods = load_supported_mods(helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"Registry unavailable: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    baseline, exists = _read_baseline()
    if not exists:
        baseline = current_mtimes(mods)
        _write_baseline_atomic(baseline)
        return {
            "stale": [],
            "baseline_exists": False,
            "baseline_path": str(_BASELINE_PATH),
            "total_known": len(mods),
        }

    return {
        "stale": detect_updates(mods, baseline),
        "baseline_exists": True,
        "baseline_path": str(_BASELINE_PATH),
        "total_known": len(mods),
    }


@router.post("/updates/sync")
def post_updates_sync():
    """Capture current mtimes as the new baseline.

    Prunes orphan entries (mods removed from `SUPPORTED_MODS` since last sync)
    and includes new entries.

    Returns:
        `{"synced_at": str, "count": int, "baseline_path": str}` on success.

    Raises:
        HTTPException(503): When `TW3_HELPER_PATH` is unset or `supported_mods.py` is missing.
        HTTPException(500): When the source file fails to load.
    """
    try:
        mods = load_supported_mods(helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"Registry unavailable: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    baseline = current_mtimes(mods)
    _write_baseline_atomic(baseline)
    return {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "count": len(baseline),
        "baseline_path": str(_BASELINE_PATH),
    }
