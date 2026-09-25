"""Glossary-suggestion endpoints for WH3: list, scan, suggest-edits, accept and dismiss.

Mounted at the game root (no prefix) so the shared `GlossarySuggestionModal` can POST to `/mods/{id}/glossary/suggestions/{accept,dismiss}` exactly as it does
for Chrono Ark. Suggestions come from the iterative `/translate/batch` loop, Scan for Terms and Suggest Edits, and are persisted via the
shared `suggestion_manager`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.data import suggestion_manager
from backend.games.storage_paths import game_storage_path
from backend.games.total_war_warhammer_3 import api_responses_store, glossary_store, snapshot_store
from backend.games.total_war_warhammer_3.adapter import TotalWarWarhammer3Adapter
from backend.games.total_war_warhammer_3.routes.translation import _extract_all_parent_strings
from backend.games.total_war_warhammer_3.translation_mods import get_translation_mod
from backend.routes.models import SuggestionAction
from backend.translator.claude_provider import ClaudeProvider

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
                entry = {"english": s["english"], "source": s.get("source", ""), "category": s.get("category", "custom")}
                edit_of = s.get("edit_of")
                if edit_of and edit_of in glossary_store.load_glossary(mod_id):
                    glossary_store.update_term(mod_id, edit_of, entry)
                else:
                    glossary_store.add_term(mod_id, entry)
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


SCAN_SAMPLE_LIMIT = 100
SUGGEST_EDITS_SAMPLE_LIMIT = 25


def _sample_parent_entries(mod, limit: int) -> list[tuple[str, str]]:
    """Take up to `limit` key/source pairs from the parent mods' strings.

    Args:
        mod: The resolved `WH3TranslationMod`.
        limit: Maximum number of entries.

    Returns:
        A list of `(key, source_text)` pairs.
    """
    entries: list[tuple[str, str]] = []
    for rows in _extract_all_parent_strings(mod).values():
        for key, row in rows.items():
            if len(entries) >= limit:
                return entries
            entries.append((key, row.text))
    return entries


def _ask_claude_for_terms(mod, entries: list[tuple[str, str]], glossary_prompt: str) -> list[dict]:
    """Ask Claude for glossary terms about the given entries, without translating them.

    Args:
        mod: The resolved `WH3TranslationMod`.
        entries: Key/source pairs to show Claude.
        glossary_prompt: Instruction for the suggested terms.

    Returns:
        Claude's suggested terms.
    """
    adapter = TotalWarWarhammer3Adapter()
    _, suggestions = ClaudeProvider().translate_batch(
        entries,
        mod.source_language,
        glossary_prompt=glossary_prompt,
        game_context=adapter.get_translation_context(),
        format_rules=adapter.get_format_preservation_rules(),
        style_examples=adapter.get_style_examples(mod.source_language),
        character_context=None,
        target_lang=mod.target_language,
    )
    return suggestions


def _log_call(mod_id: str, kind: str, keys: list[str], suggestions: list[dict]) -> None:
    """Record a Claude call in the mod's API-responses log.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.
        kind: Log entry kind, e.g. "scan-terms".
        keys: Keys that were sent.
        suggestions: What Claude returned.
    """
    api_responses_store.append(
        mod_id,
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "kind": kind,
            "provider": "claude",
            "model": "claude",
            "input_tokens": None,
            "output_tokens": None,
            "cost_usd": None,
            "keys_or_inputs": keys,
            "raw_response": json.dumps(suggestions, ensure_ascii=False),
        },
    )


def _save_new_suggestions(mod_id: str, suggestions: list[dict]) -> int:
    """Save the suggestions that are not already pending or already in the glossary.

    Edit suggestions (those with `edit_of`) are kept even when their English matches a glossary term.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.
        suggestions: Candidate suggestions.

    Returns:
        How many suggestions were newly saved.
    """
    storage_path = game_storage_path(GAME_ID)
    glossary_keys = {k.lower() for k in glossary_store.load_glossary(mod_id)}
    taken = {s.get("english", "").lower() for s in suggestion_manager.load_suggestions(mod_id, storage_path)}
    fresh: list[dict] = []
    for s in suggestions:
        english = s.get("english", "").strip()
        key = english.lower()
        if not english or key in taken or (key in glossary_keys and not s.get("edit_of")):
            continue
        taken.add(key)
        fresh.append(s)
    if fresh:
        suggestion_manager.add_suggestions(mod_id, fresh, storage_path)
    return len(fresh)


@router.get("/mods/{mod_id}/glossary/suggestions")
def get_suggestions(mod_id: str) -> list[dict]:
    """List the mod's pending glossary suggestions.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.

    Returns:
        The pending suggestion dicts.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    _require_mod(mod_id)
    return suggestion_manager.load_suggestions(mod_id, game_storage_path(GAME_ID))


@router.post("/mods/{mod_id}/glossary/suggestions/scan")
def scan_for_suggestions(mod_id: str) -> dict:
    """Ask Claude for recurring proper nouns in the parent text and save the new ones as pending suggestions.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.

    Returns:
        `{"status": "success", "new": N}`.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    mod = _require_mod(mod_id)
    entries = _sample_parent_entries(mod, SCAN_SAMPLE_LIMIT)
    suggestions = _ask_claude_for_terms(mod, entries, "Identify recurring proper nouns and domain-specific terms via suggested_terms. Do NOT translate.")
    _log_call(mod_id, "scan-terms", [k for k, _ in entries], suggestions)
    return {"status": "success", "new": _save_new_suggestions(mod_id, suggestions)}


@router.post("/mods/{mod_id}/glossary/suggest-edits")
def suggest_edits(mod_id: str) -> dict:
    """Ask Claude for refinements to the current glossary and save them as pending suggestions.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.

    Returns:
        `{"status": "success", "new": N}`.

    Raises:
        HTTPException: 404 when the mod is not registered.
    """
    mod = _require_mod(mod_id)
    entries = _sample_parent_entries(mod, SUGGEST_EDITS_SAMPLE_LIMIT)
    glossary_section = json.dumps(glossary_store.load_glossary(mod_id), ensure_ascii=False, indent=2)
    suggestions = _ask_claude_for_terms(mod, entries, f"Current glossary (suggest improvements via suggested_terms only):\n{glossary_section}")
    _log_call(mod_id, "suggest-edits", [k for k, _ in entries], suggestions)
    return {"status": "success", "new": _save_new_suggestions(mod_id, suggestions)}
