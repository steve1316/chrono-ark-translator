"""REST endpoints for the WH3 translation pipeline.

All endpoints are mounted under `/api/games/total_war_warhammer_3/translation`.
Heavy I/O (RPFM extract, TSV scan) is wrapped behind module-level helpers so
tests can monkeypatch them in isolation.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.games.total_war_warhammer_3 import translation_store_helpers as store
from backend.games.total_war_warhammer_3.loc_extractor import (
    LocRow,
    extract_parent_pack_strings,
    normalize_loc_filename,
    read_translation_loc_tsv,
)
from backend.games.total_war_warhammer_3.routes._paths import tw3_workshop_content_dir
from backend.games.total_war_warhammer_3.translation_drift import (
    DriftRow,
    compute_drift,
    hash_text,
)
from backend.games.total_war_warhammer_3.translation_mods import (
    WH3_TRANSLATION_MODS,
    WH3TranslationMod,
    get_translation_mod,
)

router = APIRouter(prefix="/translation", tags=["translation"])


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Helpers (extracted as module-level functions so tests can monkeypatch them)


def _extract_translation_strings(mod: WH3TranslationMod) -> dict[str, dict[str, LocRow]]:
    """Read all `.loc.tsv` files under `mod.local_source_dir/text/**`.

    Args:
        mod: The translation mod whose local source dir to scan.

    Returns:
        Dict mapping normalized filename to `{key: LocRow}`.
    """
    out: dict[str, dict[str, LocRow]] = {}
    text_dir = mod.local_source_dir / "text"
    if not text_dir.exists():
        return out
    for tsv in text_dir.rglob("*.loc.tsv"):
        norm = normalize_loc_filename(tsv.name)
        out[norm] = read_translation_loc_tsv(tsv)
    return out


def _extract_all_parent_strings(mod: WH3TranslationMod) -> dict[str, dict[str, LocRow]]:
    """Extract `.loc` strings from every parent `.pack` declared on `mod`.

    Resolves `rpfm_cli_path` the same way `script_runner._preflight` does: prefer
    `config.TW3_RPFM_CLI_PATH` when set, otherwise fall back to `rpfm_cli.exe`
    inside `config.TW3_HELPER_PATH`.

    Args:
        mod: The translation mod whose parent packs to extract.

    Returns:
        Merged dict mapping normalized filename to `{key: LocRow}` across all parents.

    Raises:
        HTTPException: If neither `TW3_RPFM_CLI_PATH` nor `<TW3_HELPER_PATH>/rpfm_cli.exe`
            resolves to a file on disk, or the Steam library drive is not configured.
    """
    from backend import config

    rpfm_str = config.TW3_RPFM_CLI_PATH or ""
    if rpfm_str:
        rpfm: Path | None = Path(rpfm_str)
    else:
        helper_str = config.TW3_HELPER_PATH or ""
        rpfm = Path(helper_str) / "rpfm_cli.exe" if helper_str else None
    if rpfm is None or not rpfm.is_file():
        raise HTTPException(500, f"rpfm_cli not found (tried {rpfm or 'TW3_RPFM_CLI_PATH'}); set CATL_TW3_RPFM_CLI_PATH or place rpfm_cli.exe in CATL_TW3_HELPER_PATH")

    merged: dict[str, dict[str, LocRow]] = {}
    for parent_id in mod.parent_workshop_ids:
        parent_dir = tw3_workshop_content_dir(parent_id)
        if parent_dir is None:
            raise HTTPException(500, "TW3 Steam library drive is not configured")
        if not parent_dir.exists():
            continue
        packs = sorted(parent_dir.glob("*.pack"))
        if not packs:
            continue
        cache_dir = store.parent_pack_cache_dir(parent_id)
        for pack in packs:
            extracted = extract_parent_pack_strings(pack, rpfm, cache_dir)
            for filename, rows in extracted.items():
                merged.setdefault(filename, {}).update(rows)
    return merged


def _require_mod(mod_id: str) -> WH3TranslationMod:
    """Look up a mod by ID or raise 404.

    Args:
        mod_id: Steam Workshop ID of the translation mod.

    Returns:
        The matching `WH3TranslationMod`.

    Raises:
        HTTPException: 404 if `mod_id` is not in the registry.
    """
    mod = get_translation_mod(mod_id)
    if mod is None:
        raise HTTPException(404, f"WH3 translation mod {mod_id} not registered")
    return mod


def _serialize_drift_row(row: DriftRow) -> dict:
    """Convert a `DriftRow` to a JSON-serializable dict.

    Args:
        row: The drift row to serialize.

    Returns:
        Dict with `source_filename`, `key`, `parent_text`, `translation_text`, `status`, and `provider`.
    """
    return {
        "source_filename": row.source_filename,
        "key": row.key,
        "parent_text": row.parent_text,
        "translation_text": row.translation_text,
        "status": row.status,
        "provider": row.provider,
    }


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Route models


class TranslationModSummary(BaseModel):
    """One translation-mod summary row."""

    workshop_id: str
    display_name: str
    parent_workshop_ids: list[str]
    local_source_dir: str
    source_language: str
    target_language: str


class RescanSummary(BaseModel):
    """Per-status row counts after a rescan."""

    mod_id: str
    counts: dict[str, int]
    scanned_at: str


class TranslationEdit(BaseModel):
    """Request body for `PUT /strings/{key}`."""

    text: str


class ModContext(BaseModel):
    """Request body for `PUT /mod-context`."""

    source_game: str = ""
    character_name: str = ""
    background: str = ""


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Routes


@router.get("/mods", response_model=list[TranslationModSummary])
def list_translation_mods() -> list[TranslationModSummary]:
    """Return the static registry of WH3 translation mods.

    Returns:
        List of `TranslationModSummary` entries, one per registered mod.
    """
    return [
        TranslationModSummary(
            workshop_id=m.workshop_id,
            display_name=m.display_name,
            parent_workshop_ids=list(m.parent_workshop_ids),
            local_source_dir=str(m.local_source_dir),
            source_language=m.source_language,
            target_language=m.target_language,
        )
        for m in WH3_TRANSLATION_MODS
    ]


@router.post("/mods/{mod_id}/rescan", response_model=RescanSummary)
def rescan(mod_id: str) -> RescanSummary:
    """Re-extract parent strings, re-read local translations, compute drift.

    Args:
        mod_id: Steam Workshop ID of the translation mod.

    Returns:
        `RescanSummary` with per-status counts and scan timestamp.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    mod = _require_mod(mod_id)
    parent = _extract_all_parent_strings(mod)
    translation = _extract_translation_strings(mod)
    snapshot = store.load_parent_snapshot(mod_id)

    drift = compute_drift(parent=parent, translation=translation, snapshot=snapshot)

    # Initialize snapshot for never-before-seen keys so they show as
    # untranslated rather than stale on future scans.
    next_snapshot = {fn: dict(d) for fn, d in snapshot.items()}
    for row in drift:
        if row.parent_text is None:
            continue
        next_snapshot.setdefault(row.source_filename, {})
        if row.key not in next_snapshot[row.source_filename]:
            next_snapshot[row.source_filename][row.key] = hash_text(row.parent_text)
    store.save_parent_snapshot(mod_id, next_snapshot)

    counts: dict[str, int] = {"translated": 0, "untranslated": 0, "stale": 0, "orphan": 0}
    for row in drift:
        counts[row.status] += 1

    return RescanSummary(
        mod_id=mod_id,
        counts=counts,
        scanned_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/mods/{mod_id}/strings")
def get_strings(mod_id: str, status: Literal["translated", "untranslated", "stale", "orphan"] | None = None) -> list[dict]:
    """Return drift rows for a mod, optionally filtered by status.

    Overlays `translations.json` onto the drift rows so any in-flight edits (user PUTs, Claude batches) reflect immediately - their `translation_text`
    and `provider` come from translations.json when present, otherwise from the user's `.loc.tsv` content with `provider` defaulting to `"manual"`.

    Args:
        mod_id: Steam Workshop ID of the translation mod.
        status: Optional status filter (`"translated"`, `"untranslated"`, `"stale"`, `"orphan"`).

    Returns:
        List of serialized `DriftRow` dicts.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    mod = _require_mod(mod_id)
    parent = _extract_all_parent_strings(mod)
    translation = _extract_translation_strings(mod)
    snapshot = store.load_parent_snapshot(mod_id)

    drift = compute_drift(parent=parent, translation=translation, snapshot=snapshot)

    raw_translations = store.load_translations_raw(mod_id)

    overlaid: list[DriftRow] = []
    for row in drift:
        entry = raw_translations.get(row.key)
        if entry and entry.get("text"):
            override_text = entry["text"]
            override_provider = entry.get("provider") or "manual"
            # If the row was untranslated on the file system but translations.json has it, promote it to translated per the parent hash.
            if row.status == "untranslated":
                new_status = "translated"
            else:
                new_status = row.status
            overlaid.append(
                DriftRow(
                    source_filename=row.source_filename,
                    key=row.key,
                    parent_text=row.parent_text,
                    translation_text=override_text,
                    status=new_status,
                    provider=override_provider,
                )
            )
        else:
            # Existing .loc.tsv translation (or untranslated). Default provider to "manual" when text is present, None when absent.
            provider = "manual" if row.translation_text else None
            overlaid.append(
                DriftRow(
                    source_filename=row.source_filename,
                    key=row.key,
                    parent_text=row.parent_text,
                    translation_text=row.translation_text,
                    status=row.status,
                    provider=provider,
                )
            )

    if status:
        overlaid = [r for r in overlaid if r.status == status]

    return [_serialize_drift_row(r) for r in overlaid]


@router.put("/mods/{mod_id}/strings/{key}")
def put_string(mod_id: str, key: str, edit: TranslationEdit) -> dict:
    """Persist a translation edit.

    Args:
        mod_id: Steam Workshop ID of the translation mod.
        key: The string key to save.
        edit: Request body containing the translated text.

    Returns:
        `{"status": "ok"}` on success.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    _require_mod(mod_id)
    raw = store.load_translations_raw(mod_id)
    now = datetime.now(timezone.utc).isoformat()
    existing = raw.get(key, {})
    raw[key] = {
        "text": edit.text,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
        "provider": "manual",
    }
    store.save_translations_raw(mod_id, raw)
    return {"status": "ok"}


@router.get("/mods/{mod_id}/mod-context")
def get_mod_context(mod_id: str) -> dict:
    """Return the mod context for a registered translation mod.

    Args:
        mod_id: Steam Workshop ID of the translation mod.

    Returns:
        Dict with mod context fields (`source_game`, `character_name`, `background`).

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    _require_mod(mod_id)
    return store.load_character_context(mod_id)


class TranslateBatchRequest(BaseModel):
    """Request body for `POST /mods/{mod_id}/translate`."""

    keys: list[str]


@router.post("/mods/{mod_id}/translate")
def translate_batch(mod_id: str, req: TranslateBatchRequest) -> dict:
    """Translate the given keys via Claude and persist into `translations.json`.

    `ClaudeProvider.translate_batch` takes `entries: list[tuple[str, str]]` and
    builds the system + user prompts internally via `TranslationProvider.build_prompt`.
    We pass the WH3 adapter's translation-context strings as kwargs so the prompt
    is WH3-specific.

    Args:
        mod_id: Workshop ID of the WH3 translation mod.
        req: List of loc keys to translate. Source text is looked up from the
            most recent parent extraction.

    Returns:
        `{"translated": N, "suggested_terms": [...]}`.
    """
    from backend.games.total_war_warhammer_3.adapter import TotalWarWarhammer3Adapter
    from backend.translator.claude_provider import ClaudeProvider

    mod = _require_mod(mod_id)
    parent = _extract_all_parent_strings(mod)

    # Flatten parent into {key: source_text} for the keys the user wants translated.
    src: dict[str, str] = {}
    for rows in parent.values():
        for key, row in rows.items():
            if key in req.keys:
                src[key] = row.text
    if not src:
        return {"translated": 0, "suggested_terms": []}

    adapter = TotalWarWarhammer3Adapter()
    entries = list(src.items())

    provider = ClaudeProvider()
    translations, suggested_terms = provider.translate_batch(
        entries,
        mod.source_language,
        "No glossary available.",  # per-mod glossary wiring deferred to Plan 2
        game_context=adapter.get_translation_context(),
        format_rules=adapter.get_format_preservation_rules(),
        style_examples=adapter.get_style_examples(mod.source_language),
        character_context=None,  # mod-context wiring deferred to Plan 2
        target_lang=mod.target_language,
    )

    raw = store.load_translations_raw(mod_id)
    now = datetime.now(timezone.utc).isoformat()
    for key, text in translations.items():
        existing = raw.get(key, {})
        raw[key] = {
            "text": text,
            "created_at": existing.get("created_at") or now,
            "updated_at": now,
            "provider": "claude",
        }
    store.save_translations_raw(mod_id, raw)

    from backend.games.total_war_warhammer_3 import api_responses_store

    api_responses_store.append(
        mod_id,
        {
            "timestamp": now,
            "kind": "translate-batch",
            "provider": "claude",
            "model": "claude",  # provider doesn't expose the model id back through this path
            "input_tokens": None,
            "output_tokens": None,
            "cost_usd": None,
            "keys_or_inputs": list(src.keys()),
            "raw_response": json.dumps(translations, ensure_ascii=False),
        },
    )

    return {"translated": len(translations), "suggested_terms": suggested_terms}


@router.put("/mods/{mod_id}/mod-context")
def put_mod_context(mod_id: str, ctx: ModContext) -> dict:
    """Save mod context for a registered translation mod.

    Args:
        mod_id: Steam Workshop ID of the translation mod.
        ctx: Request body containing the context fields.

    Returns:
        `{"status": "ok"}` on success.

    Raises:
        HTTPException: 404 if `mod_id` is not registered.
    """
    _require_mod(mod_id)
    store.save_character_context(mod_id, ctx.model_dump())
    return {"status": "ok"}
