"""HTTP routes for the TW3 read-only registries."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsLoaderError,
    HelperScriptsNotConfiguredError,
    RegistryFileMissingError,
    load_supported_mods,
)
from backend.games.total_war_warhammer_3.routes._paths import helper_scripts_path

router = APIRouter()


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
        mods = load_supported_mods(helper_scripts_path())
    except (HelperScriptsNotConfiguredError, RegistryFileMissingError) as exc:
        raise HTTPException(status_code=503, detail=f"Registry unavailable: {exc}")
    except HelperScriptsLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"mods": mods}
