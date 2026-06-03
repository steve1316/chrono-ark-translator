"""Glossary-suggestion review endpoints for WH3 (accept / dismiss).

Mounted at the game root (no prefix) so the shared `GlossarySuggestionModal` can POST to `/mods/{id}/glossary/suggestions/{accept,dismiss}` exactly as it does
for Chrono Ark. Suggestions are produced by the iterative `/translate/batch` loop and persisted via the shared `suggestion_manager`.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.data import suggestion_manager
from backend.games.storage_paths import game_storage_path
from backend.games.total_war_warhammer_3 import glossary_store, snapshot_store
from backend.games.total_war_warhammer_3.translation_mods import get_translation_mod
from backend.routes.models import SuggestionAction

GAME_ID = "total_war_warhammer_3"
router = APIRouter(tags=["glossary-suggestions"])


def _require_mod(mod_id: str):
    """Resolve a registered WH3 translation mod or raise 404.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.

    Returns:
        The resolved `WH3TranslationMod`.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    mod = get_translation_mod(mod_id)
    if mod is None:
        raise HTTPException(status_code=404, detail=f"translation mod not found: {mod_id}")
    return mod


@router.post("/mods/{mod_id}/glossary/suggestions/accept")
def accept_suggestions(mod_id: str, action: SuggestionAction) -> dict:
    """Accept pending glossary suggestions into the mod glossary.

    Moves the specified (or all) pending suggestions into the mod's glossary and removes them from the pending list. An auto-snapshot is taken first.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.
        action: Which suggestions to accept - explicit `terms` or `all`.

    Returns:
        `{"status": "success", "accepted": N}`.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    mod = _require_mod(mod_id)
    storage_path = game_storage_path(GAME_ID)
    suggestions = suggestion_manager.load_suggestions(mod_id, storage_path)
    terms_to_accept = {s["english"] for s in suggestions if "english" in s} if action.all else set(action.terms)

    if terms_to_accept:
        snapshot_store.create_snapshot(mod_id, label="pre-accept glossary suggestions", kind="auto", local_source_dir=mod.local_source_dir)
        for s in suggestions:
            if s.get("english") in terms_to_accept:
                glossary_store.add_term(mod_id, {"english": s["english"], "source": s.get("source", ""), "category": s.get("category", "custom")})
        suggestion_manager.remove_suggestions(mod_id, list(terms_to_accept), storage_path)

    return {"status": "success", "accepted": len(terms_to_accept)}


@router.post("/mods/{mod_id}/glossary/suggestions/dismiss")
def dismiss_suggestions(mod_id: str, action: SuggestionAction) -> dict:
    """Dismiss pending glossary suggestions without adding them to the glossary.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.
        action: Which suggestions to dismiss - explicit `terms`, or `all` to clear every pending suggestion.

    Returns:
        `{"status": "success"}`.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    _require_mod(mod_id)
    storage_path = game_storage_path(GAME_ID)
    if action.all:
        suggestion_manager.save_suggestions(mod_id, [], storage_path)
    else:
        suggestion_manager.remove_suggestions(mod_id, action.terms, storage_path)
    return {"status": "success"}
