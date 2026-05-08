"""HTTP routes for the TW3 read-only registries."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend import config
from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsLoaderError,
    HelperScriptsNotConfiguredError,
    RegistryFileMissingError,
    load_supported_effects,
    load_supported_mods,
)

router = APIRouter()


def _helper_scripts_path() -> Path:
    """Resolve the configured helper_scripts directory from `config.TW3_HELPER_PATH`.

    Returns:
        Path object. May not exist on disk; the loader validates that.
    """
    return Path(config.TW3_HELPER_PATH or "")


@router.get("/supported-mods")
def get_supported_mods():
    """Return SUPPORTED_MODS from the configured helper_scripts directory.

    Returns:
        `{"mods": [...]}` on success.

    Raises:
        HTTPException(503): When helper_scripts_path is unset or the file is missing.
        HTTPException(500): When the file fails to load (syntax error, missing constant).
    """
    try:
        mods = load_supported_mods(_helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"helper_scripts_path not configured: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"mods": mods}


@router.get("/effects")
def get_effects():
    """Return SUPPORTED_EFFECTS from the configured helper_scripts directory.

    Returns:
        `{"effects": {...}}` on success.

    Raises:
        HTTPException(503): When helper_scripts_path is unset or the file is missing.
        HTTPException(500): When the file fails to load (syntax error, missing constant).
    """
    try:
        effects = load_supported_effects(_helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"helper_scripts_path not configured: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"effects": effects}
