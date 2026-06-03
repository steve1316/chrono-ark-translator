"""CA-parity translate endpoints for WH3: `/translate/preview`, `/translate/batch`, `/translate/cancel`.

These mirror Chrono Ark's `/translate` contract so the shared `useIterativeTranslation` hook, `TranslationConfirmModal`, and `GlossarySuggestionModal` drive
WH3 translation identically. The heavy lifting (parent extraction, drift/overlay, glossary prompt, persistence) is reused from the sibling `translation` module
so monkeypatched test fakes and any future changes stay in one place. The provider call goes through the game-agnostic `run_batch` orchestrator.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.data import suggestion_manager
from backend.games.storage_paths import game_storage_path
from backend.games.total_war_warhammer_3.routes import translation as _t
from backend.routes.models import BatchTranslationRequest, TranslationRequest
from backend.translation.orchestrator import run_batch

GAME_ID = "total_war_warhammer_3"
router = APIRouter(prefix="/translate", tags=["translate"])


def _glossary_prompt(mod_id: str, source_lang: str, target_lang: str) -> str:
    """Build the combined base + mod glossary prompt section for a batch.

    Args:
        mod_id: Workshop ID of the translation mod.
        source_lang: Source language name.
        target_lang: Target language name.

    Returns:
        The combined glossary prompt, or a placeholder when no terms apply.
    """
    base_glossary = _t.glossary_store.load_base_glossary()
    mod_terms = _t.glossary_store.mod_glossary_as_terms(mod_id, source_lang)
    prompt = _t.get_combined_glossary_prompt(
        base_glossary,
        mod_terms,
        source_lang=source_lang,
        target_lang=target_lang,
        allowed_categories=_t.tc.BASE_GLOSSARY_PROMPT_CATEGORIES,
    )
    return prompt or "No glossary available."


def _untranslated_entries(mod, mod_id: str) -> list[tuple[str, str]]:
    """Return (key, source_text) tuples for every untranslated row, honoring the translations.json overlay.

    Args:
        mod: The resolved `WH3TranslationMod`.
        mod_id: Workshop ID of the translation mod.

    Returns:
        (key, source_text) tuples for rows whose overlaid drift status is `untranslated` and which still have parent source text.
    """
    parent = _t._extract_all_parent_strings(mod)
    translation = _t._extract_translation_strings(mod)
    snapshot = _t.store.load_parent_snapshot(mod_id)
    drift = _t.compute_drift(parent=parent, translation=translation, snapshot=snapshot)
    overlaid = _t._overlay_translations(drift, _t.store.load_translations_raw(mod_id))

    src_by_key: dict[str, str] = {}
    for rows in parent.values():
        for key, row in rows.items():
            src_by_key[key] = row.text

    return [(r.key, src_by_key.get(r.key, "")) for r in overlaid if r.status == "untranslated" and src_by_key.get(r.key)]


@router.post("/preview")
async def preview(req: TranslationRequest) -> dict:
    """Preview the prompts, cost estimate, and batch plan for translating a WH3 mod's untranslated rows.

    Args:
        req: Translation request carrying the mod id and optional provider override.

    Returns:
        `total_strings`, `total_batches`, `batch_size`, `provider`, `previews` (keyed by source language), `estimates` (keyed by source language), and
        a flat `batch_plan` the frontend hook iterates over. When nothing is untranslated, returns `total_strings == 0` with an empty `previews`.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    mod = _t._require_mod(req.mod_id)
    source_lang = mod.source_language
    target_lang = mod.target_language

    entries = _untranslated_entries(mod, req.mod_id)
    if not entries:
        return {"total_strings": 0, "message": "All strings already translated", "previews": {}}

    provider = _t.ClaudeProvider()
    adapter = _t.TotalWarWarhammer3Adapter()
    glossary_prompt = _glossary_prompt(req.mod_id, source_lang, target_lang)
    game_context = adapter.get_translation_context()
    format_rules = adapter.get_format_preservation_rules()
    style_examples = adapter.get_style_examples(source_lang)
    batch_size = _t.config.BATCH_SIZE

    num_batches = (len(entries) + batch_size - 1) // batch_size
    system_prompt = ""
    user_messages: list[str] = []
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        sp, um = provider.build_prompt(
            batch,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=None,
            target_lang=target_lang,
        )
        if not system_prompt:
            system_prompt = sp
        user_messages.append(um)

    previews = {source_lang: {"system_prompt": system_prompt, "user_messages": user_messages, "strings_in_language": len(entries), "batches": num_batches}}
    estimates = {
        source_lang: provider.estimate_cost(
            entries,
            source_lang=source_lang,
            glossary_prompt=glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=None,
            target_lang=target_lang,
        )
    }
    batch_plan = [{"source_lang": source_lang, "keys": [k for k, _ in entries[i : i + batch_size]], "size": len(entries[i : i + batch_size])} for i in range(0, len(entries), batch_size)]

    return {
        "total_strings": len(entries),
        "total_batches": num_batches,
        "batch_size": batch_size,
        "provider": provider.name,
        "previews": previews,
        "estimates": estimates,
        "batch_plan": batch_plan,
    }


@router.post("/batch")
async def translate_batch(req: BatchTranslationRequest) -> dict:
    """Translate one batch of keys via Claude and persist into translations.json.

    Designed for the iterative frontend loop: the hook posts one batch at a time so the user can review glossary suggestions between batches. Results are
    written incrementally and the provider's suggested glossary terms are returned for review.

    Args:
        req: Batch request with `mod_id`, explicit `keys`, `source_lang`, optional provider override, and `is_first_batch`.

    Returns:
        `{"status": "success", "translated": N, "translations": {key: text}, "suggestions": [...]}`.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
        HTTPException: 400 if none of the provided keys have source text.
        HTTPException: 502 if the provider errors.
    """
    mod = _t._require_mod(req.mod_id)
    source_lang = req.source_lang
    target_lang = mod.target_language

    parent = _t._extract_all_parent_strings(mod)
    wanted = set(req.keys)
    entries: list[tuple[str, str]] = []
    for rows in parent.values():
        for key, row in rows.items():
            if key in wanted and row.text:
                entries.append((key, row.text))
    if not entries:
        raise HTTPException(status_code=400, detail="No translatable text found for the provided keys")

    adapter = _t.TotalWarWarhammer3Adapter()
    glossary_prompt = _glossary_prompt(req.mod_id, source_lang, target_lang)
    provider = _t.ClaudeProvider()

    try:
        translations, _suggestions = await run_batch(
            provider,
            entries,
            source_lang,
            glossary_prompt,
            game_context=adapter.get_translation_context(),
            format_rules=adapter.get_format_preservation_rules(),
            style_examples=adapter.get_style_examples(source_lang),
            character_context=None,
            target_lang=target_lang,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Persist the provider's glossary suggestions so the shared review modal can accept/dismiss them between batches. Drop any term already in the mod
    # glossary so the user only reviews genuinely new terms (matching Chrono Ark's review behavior).
    existing_glossary = _t.glossary_store.load_glossary(req.mod_id)
    suggestions = [s for s in _suggestions if s.get("english") and s["english"] not in existing_glossary]
    if suggestions:
        suggestion_manager.add_suggestions(req.mod_id, suggestions, storage_path=game_storage_path(GAME_ID))

    raw = _t.store.load_translations_raw(req.mod_id)
    now = datetime.now(timezone.utc).isoformat()
    for key, text in translations.items():
        existing = raw.get(key, {})
        raw[key] = {"text": text, "created_at": existing.get("created_at") or now, "updated_at": now, "provider": "claude"}
    _t.store.save_translations_raw(req.mod_id, raw)

    _t.api_responses_store.append(
        req.mod_id,
        {
            "timestamp": now,
            "kind": "translate-batch",
            "provider": "claude",
            "model": "claude",
            "input_tokens": None,
            "output_tokens": None,
            "cost_usd": None,
            "keys_or_inputs": [k for k, _ in entries],
            "raw_response": json.dumps(translations, ensure_ascii=False),
        },
    )

    return {"status": "success", "translated": len(translations), "translations": translations, "suggestions": suggestions}


@router.post("/cancel")
async def cancel(mod_id: str = "") -> dict:
    """Signal cancellation of an in-progress translation run.

    WH3 uses non-streaming Claude, so a batch already in flight cannot be aborted mid-call. Cancellation is driven client-side by stopping the batch loop.
    This endpoint exists for parity with Chrono Ark and is a safe no-op.

    Args:
        mod_id: Workshop ID of the translation mod (accepted for parity; unused).

    Returns:
        `{"cancelled": False}` - nothing was aborted server-side.
    """
    return {"cancelled": False}
