"""
FastAPI backend for Chrono Ark Mod Translation Dashboard.

Provides REST APIs for mod discovery, string extraction, translation status,
glossary management, and triggering translation jobs.
"""

import asyncio
import hashlib
import os
import json
from datetime import datetime, timezone
import subprocess
import tempfile
import threading
import urllib.request
import uvicorn
import shutil
import httpx
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend import config
from backend.games.registry import get_adapter
from backend.games.base import GameAdapter
from backend.data.progress_tracker import ProgressTracker
from backend.data.glossary_manager import (
    load_glossary,
    save_glossary,
    add_glossary_term,
    get_combined_glossary_prompt,
    load_mod_glossary,
    save_mod_glossary,
    merge_glossaries,
    extract_name_key_suggestions,
)
from backend.data.translation_memory import TranslationMemory
from backend.data.suggestion_manager import (
    load_suggestions,
    add_suggestions,
    remove_suggestions,
    clear_suggestions,
)
from backend.data.character_context import load_character_context, save_character_context
from backend.data.history_manager import create_backup, list_backups, restore_backup, delete_backup
from backend.data.translation_store import (
    load_translations,
    save_translations_bulk,
    update_single_translation,
    clear_all_translations,
    replace_in_translations,
)
from backend.main import get_provider, save_extracted_strings
from backend.process_manager import start_process, stop_process, is_managed


# Initialize the active game adapter.
_adapter: GameAdapter = get_adapter(config.ACTIVE_GAME)

app = FastAPI(title="Chrono Ark Translator API")

# Active translation cancel events, keyed by mod_id.
_active_translations: dict[str, threading.Event] = {}


def _stamp_raw_responses(responses: list[dict]) -> list[dict]:
    """Add a timestamp to each raw API response dict."""
    now = datetime.now(timezone.utc).isoformat()
    for r in responses:
        r["timestamp"] = now
    return responses


# Enable CORS for Vite development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---


class GlossaryTerm(BaseModel):
    """A global glossary term mapping a source-language word to its English translation.

    Attributes:
        source: The original term in the source language.
        english: The English translation of the term.
    """

    source: str
    english: str


class ModGlossaryTerm(BaseModel):
    """A mod-specific glossary term with per-language source mappings.

    Attributes:
        english: The English translation of the term.
        source_mappings: Mapping of source language codes to the original term
            in each language (e.g. `{"Korean": "마법"}`).
        category: The category for this term (e.g. `"custom"`, `"skill"`).
    """

    english: str
    source_mappings: dict[str, str] = {}
    category: str = "custom"


class SuggestionAction(BaseModel):
    """Payload for accepting or dismissing glossary term suggestions.

    Attributes:
        terms: List of specific English term strings to act on.
        all: If `True`, the action applies to every pending suggestion
            regardless of `terms`.
    """

    terms: list[str] = []
    all: bool = False


class TranslationRequest(BaseModel):
    """Request body for translation, estimation, and preview endpoints.

    Attributes:
        mod_id: The unique workshop identifier of the mod to translate.
        provider: Optional override for the translation provider name.
            Defaults to the value in `config.TRANSLATION_PROVIDER` when
            `None`.
    """

    mod_id: str
    provider: Optional[str] = None


class BatchTranslationRequest(BaseModel):
    """Request body for translating a single batch of strings.

    Attributes:
        mod_id: The unique workshop identifier of the mod to translate.
        provider: Optional override for the translation provider name.
        keys: Explicit localization keys to translate in this batch.
        source_lang: The source language for all keys in this batch.
        is_first_batch: When True, creates a backup before translating.
    """

    mod_id: str
    provider: Optional[str] = None
    keys: list[str]
    source_lang: str
    is_first_batch: bool = False


class TranslationUpdate(BaseModel):
    """Payload for manually updating a single translated string.

    Attributes:
        key: The localization key identifying the string (e.g.
            `"LangDataDB::Skill_FireBall::Desc"`).
        english: The new English translation text. An empty string clears
            the existing translation.
    """

    key: str
    english: str


class CharacterContext(BaseModel):
    """Optional character lore context used to improve translation quality.

    Attributes:
        source_game: The name of the game the character originates from.
        character_name: The character's display name.
        background: Free-text description of the character's lore, personality,
            or speech style that should inform translations.
    """

    source_game: str = ""
    character_name: str = ""
    background: str = ""


class SettingsResponse(BaseModel):
    """Current application settings returned by GET /api/settings.

    Attributes:
        provider: Active translation provider ID (claude, openai, deepl, ollama, manual).
        batch_size: Number of strings sent per API request.
        anthropic_api_key_set: Masked Anthropic key (e.g. `"••••ab12"`)
            or empty string if not configured.
        openai_api_key_set: Masked OpenAI key or empty string.
        deepl_api_key_set: Masked DeepL key or empty string.
        ollama_base_url: Ollama server base URL.
        ollama_model: Selected Ollama model name.
        ollama_vram_tier: Selected VRAM tier (e.g. `"8gb"`).
        ollama_status: Ollama status — `"running"`, `"stopped"`, or `"not_installed"`.
        llamacpp_base_url: llama-server base URL.
        llamacpp_model: Display-only model name for llama-server.
        llamacpp_binary_path: Path to the llama-server binary.
        llamacpp_model_path: Path to the GGUF model file.
        llamacpp_gpu_layers: Number of layers to offload to GPU (-1 = all).
        llamacpp_ctx_size: Context window size for llama-server.
        ollama_managed: Whether this app spawned the running Ollama process.
        llamacpp_managed: Whether this app spawned the running llama-server process.
        ignored_mods: List of workshop mod IDs hidden from the dashboard.
    """

    provider: str
    batch_size: int
    anthropic_api_key_set: str
    openai_api_key_set: str
    deepl_api_key_set: str
    ollama_base_url: str
    ollama_model: str
    ollama_vram_tier: str
    ollama_status: str
    llamacpp_base_url: str
    llamacpp_model: str
    llamacpp_binary_path: str
    llamacpp_model_path: str
    llamacpp_gpu_layers: int
    llamacpp_ctx_size: int
    llamacpp_vram_tier: str
    ollama_managed: bool
    llamacpp_managed: bool
    ignored_mods: list[str]


class SettingsUpdate(BaseModel):
    """Payload for POST /api/settings.

    All fields are optional — only include fields that should change.
    Omitted (`None`) fields are left at their current values.

    Attributes:
        provider: New translation provider ID.
        batch_size: New batch size (must be >= 1).
        anthropic_api_key: New Anthropic API key value.
        openai_api_key: New OpenAI API key value.
        deepl_api_key: New DeepL API key value.
        ollama_base_url: New Ollama base URL.
        ollama_model: New Ollama model name.
        ollama_vram_tier: New VRAM tier selection.
        llamacpp_base_url: New llama-server base URL.
        llamacpp_model: New llama-server display model name.
        llamacpp_binary_path: New llama-server binary path.
        llamacpp_model_path: New GGUF model file path.
        llamacpp_gpu_layers: New GPU layer count (-1 = all).
        llamacpp_ctx_size: New context window size.
        ignored_mods: New list of workshop mod IDs to hide from the dashboard.
    """

    provider: Optional[str] = None
    batch_size: Optional[int] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    deepl_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    ollama_vram_tier: Optional[str] = None
    llamacpp_base_url: Optional[str] = None
    llamacpp_model: Optional[str] = None
    llamacpp_binary_path: Optional[str] = None
    llamacpp_model_path: Optional[str] = None
    llamacpp_gpu_layers: Optional[int] = None
    llamacpp_ctx_size: Optional[int] = None
    llamacpp_vram_tier: Optional[str] = None
    ignored_mods: Optional[list[str]] = None


# --- Helpers ---


def _fill_duplicate_translations(
    translations: dict[str, str],
    entries: list[tuple[str, str]],
) -> dict[str, str]:
    """Fill missing keys whose source text matches an already-translated entry.

    LLMs often deduplicate identical source strings and only return one key in
    the response.  This copies the translation to every other key that shares
    the same source text so nothing is left as "Pending translation...".

    Args:
        translations: Mutable dict of key -> English text returned by the LLM.
            Modified in-place to include any missing duplicate keys.
        entries: Original (key, source_text) tuples sent to the provider.
    """
    source_to_translation: dict[str, str] = {}
    for key, source_text in entries:
        if key in translations:
            source_to_translation[source_text] = translations[key]

    for key, source_text in entries:
        if key not in translations and source_text in source_to_translation:
            translations[key] = source_to_translation[source_text]

    return translations


def _filter_suggestions(
    suggestions: list[dict],
    strings: dict,
) -> list[dict]:
    """Filter suggestions to only those whose terms appear in actual text.

    Removes suggestions where the source/english term only appears in
    localization keys but not in the actual source text or English translations.

    Args:
        suggestions: Raw suggestion dicts from the provider.
        strings: The full strings dict mapping key -> LocalizedString.

    Returns:
        Filtered list of suggestion dicts.
    """
    all_source_texts: set[str] = set()
    all_english_texts: set[str] = set()
    for _key, loc_str in strings.items():
        for lang_name, text in loc_str.translations.items():
            if lang_name == "English":
                all_english_texts.add(text.lower())
            else:
                all_source_texts.add(text.lower())
    filtered = []
    for suggestion in suggestions:
        source_term = suggestion.get("source", "").lower()
        english_term = suggestion.get("english", "").lower()
        if not source_term and not english_term:
            continue
        source_found = any(source_term in text for text in all_source_texts) if source_term else False
        english_found = any(english_term in text for text in all_english_texts) if english_term else False
        if source_found or english_found:
            filtered.append(suggestion)
    return filtered


# --- API Endpoints ---


@app.get("/api/game")
async def get_game_info():
    """Return metadata about the active game adapter.

    Returns:
        A dict containing `game_id` and `game_name` for the currently
        configured game.
    """
    return {
        "game_id": _adapter.game_id,
        "game_name": _adapter.game_name,
    }


@app.get("/api/mods")
async def get_mods():
    """List all workshop mods with their current translation status.

    Returns:
        A list of dicts, one per mod, each containing the mod's id, name,
        author, CSV/DLL flags, translation progress counters, workshop URL,
        and preview image path.
    """
    mods = _adapter.scan_mods()
    tracker = ProgressTracker()

    results = []
    for mod in mods:
        status = tracker.get_status(mod.mod_id)
        preview_img = _find_mod_preview_image(mod.path)

        # Check whether this mod has unsynced translation changes.
        saved = load_translations(mod.mod_id)
        if saved:
            current_hash = _compute_export_snapshot(mod.mod_id, mod.path)
            last_hash = _load_last_export_hash(mod.mod_id)
            has_changes = current_hash != last_hash
        else:
            has_changes = False

        results.append(
            {
                "id": mod.mod_id,
                "name": mod.name,
                "author": mod.author,
                "has_csv": mod.has_loc_files,
                "has_dll": mod.has_dll,
                "total": status["total"],
                "translated": status["translated"],
                "untranslated": status["untranslated"],
                "percentage": status["percentage"],
                "last_updated": status["last_updated"],
                "url": _adapter.get_mod_url(mod.mod_id),
                "preview_image": f"/workshop/{mod.mod_id}/{preview_img.name}" if preview_img else None,
                "has_changes": has_changes,
            }
        )
    return results


def _recalculate_mod_progress(mod_id: str, mod_path: Path) -> None:
    """Re-extract strings and recalculate translation progress for a mod.

    Mirrors the progress-update logic in `get_mod_detail`: extracts all
    localization strings from the mod's files on disk, layers any saved
    user translations on top, then updates the `ProgressTracker` snapshot
    so that `get_status` returns accurate totals/translated counts.

    A string is considered translated when it has a non-empty English value
    **or** its source text is blank (nothing to translate).

    Args:
        mod_id: Workshop identifier of the mod (e.g. "12345").
        mod_path: Filesystem path to the mod's workshop directory.
    """
    strings, _ = _adapter.extract_strings(mod_path)
    _merge_gdata_originals(mod_id, strings)

    # Apply saved translations.
    translations = load_translations(mod_id)
    for key, english in translations.items():
        if key in strings:
            strings[key].translations["English"] = english

    # Update the progress snapshot.
    tracker = ProgressTracker()
    tracker.update(mod_id, strings, _adapter.source_languages)

    # Compute translated keys the same way get_mod_detail does.
    translated_keys = []
    for key, loc_str in strings.items():
        source_lang = _adapter.detect_source_language(loc_str)
        source_text = loc_str.translations.get(source_lang, "") if source_lang else ""
        english = loc_str.translations.get("English", "")
        if bool(english) or not source_text.strip():
            translated_keys.append(key)

    tracker.set_translated(mod_id, translated_keys)


@app.post("/api/mods/refresh")
async def refresh_mods(request: Request):
    """Rescan all mods and recalculate translation progress from disk.

    Streams SSE events so the frontend can display a progress indicator.
    Each mod emits a `progress` event with `current`/`total` counts
    and the mod name.  The final event carries the complete results list.

    The generator checks `request.is_disconnected` between mods so that
    navigating away or refreshing the page aborts the work early.

    Returns:
        A `StreamingResponse` of `text/event-stream` SSE events.
    """
    mods = _adapter.scan_mods()

    async def event_stream():
        tracker = ProgressTracker()
        results = []
        total = len(mods)

        for i, mod in enumerate(mods):
            # Abort early if the client disconnected.
            if await request.is_disconnected():
                return

            _recalculate_mod_progress(mod.mod_id, mod.path)

            status = tracker.get_status(mod.mod_id)
            preview_img = _find_mod_preview_image(mod.path)

            saved = load_translations(mod.mod_id)
            if saved:
                current_hash = _compute_export_snapshot(mod.mod_id, mod.path)
                last_hash = _load_last_export_hash(mod.mod_id)
                has_changes = current_hash != last_hash
            else:
                has_changes = False

            mod_result = {
                "id": mod.mod_id,
                "name": mod.name,
                "author": mod.author,
                "has_csv": mod.has_loc_files,
                "has_dll": mod.has_dll,
                "total": status["total"],
                "translated": status["translated"],
                "untranslated": status["untranslated"],
                "percentage": status["percentage"],
                "last_updated": status["last_updated"],
                "url": _adapter.get_mod_url(mod.mod_id),
                "preview_image": f"/workshop/{mod.mod_id}/{preview_img.name}" if preview_img else None,
                "has_changes": has_changes,
            }
            results.append(mod_result)

            progress_event = {"current": i + 1, "total": total, "mod_name": mod.name}
            yield f"data: {json.dumps(progress_event)}\n\n"

        yield f"data: {json.dumps({'done': True, 'results': results})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/mods/{mod_id}")
async def get_mod_detail(mod_id: str):
    """Get detailed string data for a specific mod.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with the mod's metadata, a `strings` list containing every
        localization entry (key, source text, English text, translation
        status), and a `duplicate_files` list of any variant CSV paths
        that were found.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    # Find the mod path by scanning.
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    # Extract current strings
    strings, duplicate_files = _adapter.extract_strings(mod_path)

    # For gdata-sourced mods whose JSONs have already been exported,
    # restore the original Chinese source text from backup.
    _merge_gdata_originals(mod_id, strings)

    # Load existing translations if any
    translations = load_translations(mod_id)

    # Load translation provider info per key.
    providers_path = config.STORAGE_PATH / "mods" / mod_id / "translation_providers.json"
    translation_providers: dict[str, str] = {}
    if providers_path.exists():
        try:
            with open(providers_path, "r", encoding="utf-8") as f:
                translation_providers = json.load(f)
        except Exception:
            pass

    # Capture original CSV English values before applying overrides.
    original_english_map = {key: loc_str.translations.get("English", "") for key, loc_str in strings.items()}

    # Load synced keys to identify rows that have been exported to CSV.
    synced_keys_path = config.STORAGE_PATH / "mods" / mod_id / "synced_keys.json"
    synced_keys: set[str] = set()
    if synced_keys_path.exists():
        try:
            with open(synced_keys_path, "r", encoding="utf-8") as f:
                synced_keys = set(json.load(f))
        except Exception:
            pass

    # If export snapshot has drifted (CSV files deleted/changed, new
    # translations), the per-row synced status is stale — clear it.
    if synced_keys:
        current_hash = _compute_export_snapshot(mod_id, mod_path)
        last_hash = _load_last_export_hash(mod_id)
        if current_hash != last_hash:
            synced_keys = set()

    # Load pre-export English values saved at export time so the UI can
    # show a diff for synced rows (the CSV now contains the translated
    # values, so we need the snapshot from before the export).
    pre_export_english: dict[str, str] = {}
    if synced_keys:
        pre_export_path = config.STORAGE_PATH / "mods" / mod_id / "pre_export_english.json"
        if pre_export_path.exists():
            try:
                with open(pre_export_path, "r", encoding="utf-8") as f:
                    pre_export_english = json.load(f)
            except Exception:
                pass

    # Apply saved translations so user edits (including clears) are respected.
    for key, english in translations.items():
        if key in strings:
            strings[key].translations["English"] = english

    # Update progress tracker so dashboard stats reflect this mod's strings.
    tracker = ProgressTracker()
    tracker.update(mod_id, strings, _adapter.source_languages)

    # Build result list and collect actually-translated keys.
    translated_keys = []
    results = []
    for key, loc_str in strings.items():
        source_lang = _adapter.detect_source_language(loc_str)
        source_text = loc_str.translations.get(source_lang, "") if source_lang else ""
        english = loc_str.translations.get("English", "")

        is_done = bool(english) or not source_text.strip()
        if is_done:
            translated_keys.append(key)

        has_override = key in translations
        # A row is synced if it was explicitly exported OR if its English
        # value matches the CSV and was never overridden by the user.
        csv_english = original_english_map.get(key, "")
        is_synced = key in synced_keys or (bool(csv_english) and not has_override and english == csv_english)
        results.append(
            {
                "key": key,
                "type": loc_str.type,
                "desc": loc_str.desc,
                "source": source_text,
                "source_lang": source_lang,
                "english": english,
                "is_translated": is_done,
                "original_english": pre_export_english.get(key, original_english_map.get(key, "")) if is_synced else original_english_map.get(key, ""),
                "is_synced": is_synced,
                "synced_english": english if is_synced else "",
                "source_file": loc_str.source_file,
                "translated_by": translation_providers.get(key, ""),
            }
        )

    # Replace (not just add) the translated list so clears are reflected.
    tracker.set_translated(mod_id, translated_keys)

    preview_img = _find_mod_preview_image(mod_path)
    return {
        "id": mod_id,
        "name": matching[0].name,
        "author": matching[0].author,
        "url": _adapter.get_mod_url(mod_id),
        "preview_image": f"/workshop/{mod_id}/{preview_img.name}" if preview_img else None,
        "strings": results,
        "duplicate_files": duplicate_files,
    }


@app.post("/api/mods/{mod_id}/strings")
async def update_string(mod_id: str, update: TranslationUpdate):
    """Save a manual translation for a specific key.

    Args:
        mod_id: The workshop identifier of the mod.
        update: The translation update containing the localization key and the
            new English text.

    Returns:
        A dict with `{"status": "success"}` on success.
    """
    update_single_translation(mod_id, update.key, update.english)

    # Track that this key was manually edited.
    providers_path = config.STORAGE_PATH / "mods" / mod_id / "translation_providers.json"
    providers: dict[str, str] = {}
    if providers_path.exists():
        try:
            with open(providers_path, "r", encoding="utf-8") as f:
                providers = json.load(f)
        except Exception:
            pass
    providers[update.key] = "manual"
    with open(providers_path, "w", encoding="utf-8") as f:
        json.dump(providers, f, indent=2, ensure_ascii=False)

    # Update progress tracker
    tracker = ProgressTracker()

    # We need to know if the source is empty to decide if it stays "translated"
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if matching:
        strings, _ = _adapter.extract_strings(matching[0].path)
        if update.key in strings:
            loc_str = strings[update.key]
            source_lang = _adapter.detect_source_language(loc_str)
            source_text = loc_str.translations.get(source_lang, "") if source_lang else ""

            is_done = bool(update.english) or not source_text.strip()
            if is_done:
                tracker.mark_translated(mod_id, [update.key])
            else:
                tracker.unmark_translated(mod_id, [update.key])

    return {"status": "success"}


@app.post("/api/mods/{mod_id}/sync")
async def sync_mod(mod_id: str):
    """Re-scan and extract strings for a mod.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status` and counts of `new`, `modified`,
        `removed`, and `unchanged` keys detected during the sync.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    output_path = config.STORAGE_PATH / "mods" / mod_id / "source.json"
    save_extracted_strings(strings, output_path)

    tracker = ProgressTracker()
    diff = tracker.update(mod_id, strings, _adapter.source_languages)

    return {"status": "success", "new": len(diff.new_keys), "modified": len(diff.modified_keys), "removed": len(diff.removed_keys), "unchanged": len(diff.unchanged_keys)}


@app.post("/api/mods/{mod_id}/clear-translations")
async def clear_translations(mod_id: str):
    """Clear all English translations so every row is sent to the AI provider.

    Writes empty-string overrides for every key that had an English value,
    effectively resetting the mod to an untranslated state.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `{"status": "success"}` on success.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")

    strings, _ = _adapter.extract_strings(matching[0].path)

    # Back up before clearing.
    create_backup(mod_id, "Before clearing English translations")

    # Write empty overrides for every key that has an English value in the CSV
    # so the original CSV values don't show through.
    keys_to_clear: list[str] = []
    for key, loc_str in strings.items():
        if loc_str.translations.get("English", ""):
            keys_to_clear.append(key)

    # Also clear any previously saved translations.
    existing = load_translations(mod_id)
    for key in existing:
        if key not in keys_to_clear:
            keys_to_clear.append(key)

    clear_all_translations(mod_id, keys_to_clear)

    # Clear synced state since all translations have been wiped.
    for filename in ("synced_keys.json", "pre_export_english.json"):
        path = config.STORAGE_PATH / "mods" / mod_id / filename
        if path.exists():
            path.unlink()

    # Re-run update so total_keys / hashes stay correct for the dashboard.
    tracker = ProgressTracker()
    tracker.update(mod_id, strings, _adapter.source_languages)

    # Mark untranslated everything EXCEPT keys with empty sources.
    done_keys = []
    for key, loc_str in strings.items():
        source_lang = _adapter.detect_source_language(loc_str)
        source_text = loc_str.translations.get(source_lang, "") if source_lang else ""
        if not source_text.strip():
            done_keys.append(key)

    tracker.set_translated(mod_id, done_keys)

    return {"status": "success"}


@app.post("/api/mods/{mod_id}/reset")
async def reset_mod(mod_id: str):
    """Reset a mod by clearing all translation data and restoring original CSV files.

    If original CSV backups exist (created before the first export), they are
    copied back to the mod directory. Then the entire storage directory for
    the mod is deleted.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status`, and `csv_restored` indicating whether
        original CSV files were restored.

    Raises:
        HTTPException: 500 if the operation fails.
    """
    mod_storage = config.STORAGE_PATH / "mods" / mod_id
    if not mod_storage.exists():
        return {"status": "success", "csv_restored": False, "message": "No data to clear"}

    # Back up before resetting.
    create_backup(mod_id, "Before reset")

    # Restore original CSV files if we have them.
    csv_restored = False
    original_csv_dir = mod_storage / "original_csvs"
    if original_csv_dir.exists():
        mod_path = _find_mod_path(mod_id)
        for src in original_csv_dir.rglob("*"):
            if src.is_file():
                rel = src.relative_to(original_csv_dir)
                dest = mod_path / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
                csv_restored = True

    # Restore original gdata JSON files if we have them.
    gdata_restored = False
    original_gdata_dir = mod_storage / "original_gdata"
    if original_gdata_dir.exists():
        mod_path = _find_mod_path(mod_id)
        gdata_dest = mod_path / "gdata" / "Add"
        gdata_dest.mkdir(parents=True, exist_ok=True)
        for src in original_gdata_dir.rglob("*"):
            if src.is_file():
                shutil.copy2(src, gdata_dest / src.name)
                gdata_restored = True

    # Selectively delete only translation-related files and directories,
    # preserving user-configured data (character context, glossary, etc.).
    files_to_delete = [
        "translations.json",
        "progress.json",
        "synced_keys.json",
        "last_export.json",
        "pre_export_english.json",
        "last_api_responses.json",
    ]
    dirs_to_delete = ["original_csvs", "original_gdata"]

    try:
        for filename in files_to_delete:
            path = mod_storage / filename
            if path.exists():
                path.unlink()
        for dirname in dirs_to_delete:
            path = mod_storage / dirname
            if path.exists():
                shutil.rmtree(path)
        return {
            "status": "success",
            "csv_restored": csv_restored,
            "gdata_restored": gdata_restored,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset: {str(e)}")


@app.post("/api/mods/{mod_id}/open")
async def open_mod_folder(mod_id: str):
    """Open the mod's directory in the system file explorer.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `{"status": "success"}` on success.

    Raises:
        HTTPException: 404 if the mod or its directory is not found.
        HTTPException: 500 if the OS fails to open the folder.
    """
    mod_path = _find_mod_path(mod_id)
    if not mod_path.exists():
        raise HTTPException(status_code=404, detail="Mod directory not found")

    try:
        # Use os.startfile on Windows for the most native experience.
        os.startfile(mod_path)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")


@app.post("/api/translate/estimate")
async def estimate_translation(req: TranslationRequest):
    """Estimate cost and time for translating a mod.

    Args:
        req: Translation request containing the mod id and optional provider
            override.

    Returns:
        A dict with `total_strings`, `provider` name, and `estimates`
        keyed by source language, each containing the provider's cost and
        token estimates.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == req.mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    untranslated = _adapter.get_untranslated(strings)

    if not untranslated:
        return {"total": 0, "estimates": {}}

    provider_name = req.provider or config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    # Group by language
    by_lang = {}
    for key, loc_str in untranslated.items():
        lang = _adapter.detect_source_language(loc_str)
        if lang not in by_lang:
            by_lang[lang] = []
        by_lang[lang].append((key, loc_str.translations.get(lang, "")))

    # Load glossary and context for accurate cost estimation.
    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    estimates = {}
    for lang, entries in by_lang.items():
        glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=lang)
        estimates[lang] = provider.estimate_cost(
            entries,
            source_lang=lang,
            glossary_prompt=glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )

    return {"total_strings": len(untranslated), "provider": provider.name, "estimates": estimates}


@app.post("/api/translate/estimate-all")
async def estimate_all_translation_costs(request: Request):
    """Estimate translation cost for all mods, treating every string as untranslated.

    Streams SSE progress events as each mod is processed. Each event
    contains the mod's id, name, string count, and per-language cost
    estimates. The final event carries `done: true`.

    The generator checks `request.is_disconnected` between mods so that
    navigating away or refreshing the page aborts the work early.

    Args:
        request: The Starlette request, used for disconnect detection.

    Returns:
        A `StreamingResponse` of `text/event-stream` SSE events.
    """
    mods = _adapter.scan_mods()
    provider_name = config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    async def event_stream():
        total = len(mods)
        base_glossary = load_glossary()
        game_context = _adapter.get_translation_context()
        format_rules = _adapter.get_format_preservation_rules()
        style_examples = _adapter.get_style_examples()

        for i, mod in enumerate(mods):
            if await request.is_disconnected():
                return

            strings, _ = _adapter.extract_strings(mod.path)

            # Treat ALL strings as needing translation (ignore existing English).
            # Detect source language once per string to avoid redundant calls.
            # Fall back to Chinese for gdata/DLL strings that only have an
            # English key in their translations dict.
            by_lang: dict[str, list[tuple[str, str]]] = {}
            entry_count = 0
            for key, loc_str in strings.items():
                lang = _adapter.detect_source_language(loc_str)
                if lang is None:
                    english = loc_str.translations.get("English", "").strip()
                    if english:
                        lang = "Chinese"
                if lang is not None:
                    entry_count += 1
                    if lang not in by_lang:
                        by_lang[lang] = []
                    by_lang[lang].append((key, loc_str.translations.get(lang, "")))

            estimates = {}
            if by_lang:
                mod_glossary = load_mod_glossary(mod.mod_id)
                char_ctx = load_character_context(mod.mod_id)
                character_context = char_ctx if any(char_ctx.values()) else None

                for lang, entries in by_lang.items():
                    glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=lang)
                    estimates[lang] = provider.estimate_cost(
                        entries,
                        source_lang=lang,
                        glossary_prompt=glossary_prompt,
                        game_context=game_context,
                        format_rules=format_rules,
                        style_examples=style_examples,
                        character_context=character_context,
                    )

            event = {
                "current": i + 1,
                "total": total,
                "mod_id": mod.mod_id,
                "mod_name": mod.name,
                "total_strings": entry_count,
                "provider": provider.name,
                "estimates": estimates,
            }
            yield f"data: {json.dumps(event)}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/translate/preview")
async def preview_translation(req: TranslationRequest):
    """Preview the translation prompt that will be sent to the provider.

    Builds the system prompt and user message for the first batch of each
    source language so the user can inspect what will be sent before
    committing to a full translation run.

    Args:
        req: Translation request containing the mod id and optional provider
            override.

    Returns:
        A dict with `total_strings`, `total_batches`, `batch_size`,
        `provider` name, `previews` keyed by source language (each
        containing the prompts and batch metadata), and `estimates` with
        per-language cost estimates.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == req.mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    _merge_gdata_originals(req.mod_id, strings)

    # Apply saved translations so user edits (including clears) are respected.
    saved = load_translations(req.mod_id)
    for key, english in saved.items():
        if key in strings:
            strings[key].translations["English"] = english

    untranslated = _adapter.get_untranslated(strings)

    if not untranslated:
        return {"total_strings": 0, "message": "All strings already translated", "previews": {}}

    provider_name = req.provider or config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    by_lang: dict[str, list] = {}
    for key, loc_str in untranslated.items():
        lang = _adapter.detect_source_language(loc_str)
        if lang:
            if lang not in by_lang:
                by_lang[lang] = []
            by_lang[lang].append((key, loc_str.translations.get(lang, "")))

    batch_size = config.BATCH_SIZE
    previews = {}
    estimates = {}
    total_batches = 0
    for lang, entries in by_lang.items():
        glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=lang)
        num_batches = (len(entries) + batch_size - 1) // batch_size
        total_batches += num_batches
        user_messages: list[str] = []
        system_prompt = ""
        for i in range(0, len(entries), batch_size):
            batch = entries[i : i + batch_size]
            sp, um = provider.build_prompt(
                batch,
                lang,
                glossary_prompt,
                game_context=game_context,
                format_rules=format_rules,
                style_examples=style_examples,
                character_context=character_context,
            )
            if not system_prompt:
                system_prompt = sp
            user_messages.append(um)
        previews[lang] = {
            "system_prompt": system_prompt,
            "user_messages": user_messages,
            "strings_in_language": len(entries),
            "batches": num_batches,
        }
        estimates[lang] = provider.estimate_cost(
            entries,
            source_lang=lang,
            glossary_prompt=glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )

    # Build a flat batch plan the frontend can iterate over.
    batch_plan = []
    for lang, entries in by_lang.items():
        for i in range(0, len(entries), batch_size):
            batch = entries[i : i + batch_size]
            batch_plan.append(
                {
                    "source_lang": lang,
                    "keys": [key for key, _ in batch],
                    "size": len(batch),
                }
            )

    return {
        "total_strings": len(untranslated),
        "total_batches": total_batches,
        "batch_size": batch_size,
        "provider": provider.name,
        "previews": previews,
        "estimates": estimates,
        "batch_plan": batch_plan,
    }


@app.post("/api/translate")
async def translate_mod(req: TranslationRequest):
    """Trigger translation for a mod.

    Sends all untranslated strings to the configured AI provider in batches,
    saves the resulting translations, updates progress tracking, and stores
    any glossary suggestions returned by the provider.

    Args:
        req: Translation request containing the mod id and optional provider
            override.

    Returns:
        A dict with `status`, the count of `translated` strings, the
        count of `suggestions` received, and a `translations` mapping
        of key to English text.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
        HTTPException: 502 if the translation provider returns an error.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == req.mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)

    # Apply saved translations so user edits (including clears) are respected.
    saved = load_translations(req.mod_id)
    for key, english in saved.items():
        if key in strings:
            strings[key].translations["English"] = english

    untranslated = _adapter.get_untranslated(strings)

    provider_name = req.provider or config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    if not untranslated:
        return {"status": "complete", "message": "All strings already translated", "translated": 0, "suggestions": 0}

    # Load glossaries.
    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    # Translate.
    tm = TranslationMemory()
    all_translations: dict[str, str] = {}
    all_suggestions: list[dict] = []

    by_lang: dict[str, list] = {}
    for key, loc_str in untranslated.items():
        lang = _adapter.detect_source_language(loc_str)
        if lang:
            if lang not in by_lang:
                by_lang[lang] = []
            by_lang[lang].append((key, loc_str.translations.get(lang, "")))

    # Back up before translation run.
    create_backup(req.mod_id, "Before translation run")

    # Reset raw response tracking on the provider
    if hasattr(provider, "last_raw_responses"):
        provider.last_raw_responses = []

    batch_size = config.BATCH_SIZE
    try:
        for lang, entries in by_lang.items():
            glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=lang)
            for i in range(0, len(entries), batch_size):
                batch = entries[i : i + batch_size]
                translations, suggestions = provider.translate_batch(
                    batch,
                    lang,
                    glossary_prompt,
                    game_context=game_context,
                    format_rules=format_rules,
                    style_examples=style_examples,
                    character_context=character_context,
                )
                _fill_duplicate_translations(translations, batch)
                all_translations.update(translations)
                all_suggestions.extend(suggestions)

                for key, english in translations.items():
                    source_text = next((t for k, t in batch if k == key), "")
                    if source_text and english:
                        tm.store(source_text, english, lang)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Save raw API responses for inspection
    raw_responses = getattr(provider, "last_raw_responses", [])
    if raw_responses:
        _stamp_raw_responses(raw_responses)
        responses_path = config.STORAGE_PATH / "mods" / req.mod_id / "last_api_responses.json"
        responses_path.parent.mkdir(parents=True, exist_ok=True)
        with open(responses_path, "w", encoding="utf-8") as f:
            json.dump(raw_responses, f, indent=2, ensure_ascii=False)

    # Save translations.
    save_translations_bulk(req.mod_id, all_translations)

    # Update progress.
    tracker = ProgressTracker()
    tracker.mark_translated(req.mod_id, list(all_translations.keys()))

    # Save TM.
    tm.save()

    filtered_suggestions = _filter_suggestions(all_suggestions, strings)

    # Auto-detect name-key terms not already suggested by the provider.
    existing_suggestions = load_suggestions(req.mod_id)
    combined_existing = existing_suggestions + filtered_suggestions
    for lang, entries in by_lang.items():
        lang_keys = [k for k, _ in entries if k in all_translations]
        name_key_suggestions = extract_name_key_suggestions(
            translated_keys=lang_keys,
            strings=strings,
            translations=all_translations,
            source_lang=lang,
            existing_suggestions=combined_existing,
            mod_glossary=mod_glossary,
            term_categories=_adapter.get_glossary_categories(),
        )
        filtered_suggestions.extend(name_key_suggestions)
        combined_existing.extend(name_key_suggestions)

    # Store suggestions (add_suggestions deduplicates internally).
    if filtered_suggestions:
        add_suggestions(req.mod_id, filtered_suggestions)

    # Return the actual stored count (post-dedup) so the UI is accurate.
    stored_suggestions = load_suggestions(req.mod_id)

    return {
        "status": "success",
        "translated": len(all_translations),
        "suggestions": len(stored_suggestions),
        "translations": all_translations,
    }


@app.post("/api/translate/batch")
async def translate_batch(req: BatchTranslationRequest):
    """Translate a single batch of strings by explicit keys.

    Designed for iterative batch translation where the frontend drives the
    loop, allowing the user to review glossary suggestions between batches.
    The glossary is reloaded fresh each call so newly accepted terms from
    previous batch reviews are included.

    Args:
        req: Batch translation request with mod_id, explicit keys,
            source_lang, and whether this is the first batch.

    Returns:
        A dict with `translations` (key->english), `suggestions` (full
        suggestion objects for review), and `translated` count.

    Raises:
        HTTPException: 404 if the mod is not found.
        HTTPException: 400 if none of the provided keys have translatable text.
        HTTPException: 502 if the translation provider returns an error.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == req.mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    _merge_gdata_originals(req.mod_id, strings)

    # Apply saved translations so user edits (including clears) are respected.
    saved = load_translations(req.mod_id)
    for key, english in saved.items():
        if key in strings:
            strings[key].translations["English"] = english

    # Build entries list from the explicit keys.
    entries: list[tuple[str, str]] = []
    for key in req.keys:
        if key in strings:
            source_text = strings[key].translations.get(req.source_lang, "")
            if source_text:
                entries.append((key, source_text))

    if not entries:
        raise HTTPException(status_code=400, detail="No translatable text found for the provided keys")

    provider_name = req.provider or config.TRANSLATION_PROVIDER

    if provider_name == "llamacpp":
        await _ensure_llamacpp_running()

    provider = get_provider(provider_name)

    # Create backup and reset raw responses only on the first batch.
    if req.is_first_batch:
        create_backup(req.mod_id, "Before translation run")
        if hasattr(provider, "last_raw_responses"):
            provider.last_raw_responses = []

    # Re-load glossaries fresh (picks up terms accepted between batches).
    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=req.source_lang)

    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    tm = TranslationMemory()

    try:
        translations, suggestions = provider.translate_batch(
            entries,
            req.source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Fill in keys the LLM dropped due to duplicate source text.
    _fill_duplicate_translations(translations, entries)

    # Store translation memory entries.
    for key, english in translations.items():
        source_text = next((t for k, t in entries if k == key), "")
        if source_text and english:
            tm.store(source_text, english, req.source_lang)

    # Append raw API responses for inspection (accumulate across batches).
    raw_responses = getattr(provider, "last_raw_responses", [])
    if raw_responses:
        _stamp_raw_responses(raw_responses)
        responses_path = config.STORAGE_PATH / "mods" / req.mod_id / "last_api_responses.json"
        responses_path.parent.mkdir(parents=True, exist_ok=True)
        existing_responses = []
        if not req.is_first_batch and responses_path.exists():
            try:
                with open(responses_path, "r", encoding="utf-8") as f:
                    existing_responses = json.load(f)
            except Exception:
                pass
        existing_responses.extend(raw_responses)
        with open(responses_path, "w", encoding="utf-8") as f:
            json.dump(existing_responses, f, indent=2, ensure_ascii=False)

    # Save translations incrementally.
    save_translations_bulk(req.mod_id, translations)

    # Track which provider translated each key.
    providers_path = config.STORAGE_PATH / "mods" / req.mod_id / "translation_providers.json"
    existing_providers: dict[str, str] = {}
    if providers_path.exists():
        try:
            with open(providers_path, "r", encoding="utf-8") as f:
                existing_providers = json.load(f)
        except Exception:
            pass
    for key in translations:
        existing_providers[key] = provider_name
    with open(providers_path, "w", encoding="utf-8") as f:
        json.dump(existing_providers, f, indent=2, ensure_ascii=False)

    # Update progress.
    tracker = ProgressTracker()
    tracker.mark_translated(req.mod_id, list(translations.keys()))

    # Save TM.
    tm.save()

    # Filter and store suggestions.
    filtered_suggestions = _filter_suggestions(suggestions, strings)

    # Auto-detect name-key terms not already suggested by the provider.
    existing_suggestions = load_suggestions(req.mod_id)
    name_key_suggestions = extract_name_key_suggestions(
        translated_keys=list(translations.keys()),
        strings=strings,
        translations=translations,
        source_lang=req.source_lang,
        existing_suggestions=existing_suggestions + filtered_suggestions,
        mod_glossary=mod_glossary,
        term_categories=_adapter.get_glossary_categories(),
    )
    filtered_suggestions.extend(name_key_suggestions)

    if filtered_suggestions:
        add_suggestions(req.mod_id, filtered_suggestions)

    return {
        "status": "success",
        "translated": len(translations),
        "translations": translations,
        "suggestions": filtered_suggestions,
    }


@app.post("/api/translate/cancel")
async def translate_cancel(mod_id: str = ""):
    """Signal an in-progress streaming translation to stop.

    Args:
        mod_id: The mod whose translation should be cancelled.  Looks up the
            corresponding cancel event in `_active_translations`.
    """
    event = _active_translations.pop(mod_id, None)
    if event:
        event.set()
    return {"cancelled": event is not None}


@app.post("/api/translate/batch/stream")
async def translate_batch_stream(req: BatchTranslationRequest, request: Request):
    """Translate a single batch with real-time SSE progress events.

    Same logic as `/api/translate/batch` but streams progress events for
    providers that support it (currently Ollama).  Non-streaming providers
    fall back to a single `complete` event.

    Args:
        req: Batch translation parameters (mod_id, provider, keys, etc.).
        request: The underlying Starlette request, used to detect client
            disconnection so the Ollama process can be stopped early.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == req.mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    _merge_gdata_originals(req.mod_id, strings)

    saved = load_translations(req.mod_id)
    for key, english in saved.items():
        if key in strings:
            strings[key].translations["English"] = english

    entries: list[tuple[str, str]] = []
    for key in req.keys:
        if key in strings:
            source_text = strings[key].translations.get(req.source_lang, "")
            if source_text:
                entries.append((key, source_text))

    if not entries:
        raise HTTPException(status_code=400, detail="No translatable text found for the provided keys")

    provider_name = req.provider or config.TRANSLATION_PROVIDER

    if provider_name == "llamacpp":
        await _ensure_llamacpp_running()

    provider = get_provider(provider_name)

    if req.is_first_batch:
        create_backup(req.mod_id, "Before translation run")
        if hasattr(provider, "last_raw_responses"):
            provider.last_raw_responses = []

    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    glossary_prompt = get_combined_glossary_prompt(base_glossary, mod_glossary, source_lang=req.source_lang)

    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    tm = TranslationMemory()

    async def event_stream():
        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        loop = asyncio.get_event_loop()
        cancel_event = threading.Event()
        _active_translations[req.mod_id] = cancel_event

        def run_generator():
            try:
                for event in provider.translate_batch_stream(
                    entries,
                    req.source_lang,
                    glossary_prompt,
                    game_context=game_context,
                    format_rules=format_rules,
                    style_examples=style_examples,
                    character_context=character_context,
                    cancel_event=cancel_event,
                ):
                    if cancel_event.is_set():
                        break
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as e:
                if not cancel_event.is_set():
                    loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": str(e)})
            finally:
                _active_translations.pop(req.mod_id, None)
                loop.call_soon_threadsafe(queue.put_nowait, None)

        loop.run_in_executor(None, run_generator)

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                if await request.is_disconnected():
                    cancel_event.set()
                    break
                continue

            if event is None:
                break

            if event.get("type") == "complete":
                translations = event.get("translations", {})
                suggestions = event.get("suggestions", [])

                # Fill in keys the LLM dropped due to duplicate source text.
                _fill_duplicate_translations(translations, entries)
                event["translations"] = translations

                for key, english in translations.items():
                    source_text = next((t for k, t in entries if k == key), "")
                    if source_text and english:
                        tm.store(source_text, english, req.source_lang)

                raw_responses = getattr(provider, "last_raw_responses", [])
                if raw_responses:
                    _stamp_raw_responses(raw_responses)
                    responses_path = config.STORAGE_PATH / "mods" / req.mod_id / "last_api_responses.json"
                    responses_path.parent.mkdir(parents=True, exist_ok=True)
                    existing_responses = []
                    if not req.is_first_batch and responses_path.exists():
                        try:
                            with open(responses_path, "r", encoding="utf-8") as f:
                                existing_responses = json.load(f)
                        except Exception:
                            pass
                    existing_responses.extend(raw_responses)
                    with open(responses_path, "w", encoding="utf-8") as f:
                        json.dump(existing_responses, f, indent=2, ensure_ascii=False)

                save_translations_bulk(req.mod_id, translations)

                tracker = ProgressTracker()
                tracker.mark_translated(req.mod_id, list(translations.keys()))

                tm.save()

                filtered_suggestions = _filter_suggestions(suggestions, strings)

                # Auto-detect name-key terms not already suggested.
                existing_suggestions = load_suggestions(req.mod_id)
                name_key_suggestions = extract_name_key_suggestions(
                    translated_keys=list(translations.keys()),
                    strings=strings,
                    translations=translations,
                    source_lang=req.source_lang,
                    existing_suggestions=existing_suggestions + filtered_suggestions,
                    mod_glossary=mod_glossary,
                    term_categories=_adapter.get_glossary_categories(),
                )
                filtered_suggestions.extend(name_key_suggestions)

                if filtered_suggestions:
                    add_suggestions(req.mod_id, filtered_suggestions)

            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _merge_gdata_originals(mod_id: str, strings: dict[str, "LocString"]) -> None:
    """Restore original Chinese source text for gdata entries from backup.

    After exporting translations into gdata JSON files, re-extraction
    picks up the English text but loses the Chinese source.  This helper
    reads the backed-up originals and merges the Chinese text back into
    any entry that only has English.
    """
    from backend.games.chrono_ark import gdata_extractor

    backup_dir = config.STORAGE_PATH / "mods" / mod_id / "original_gdata"
    if not backup_dir.exists():
        return

    # Extract strings from the backed-up originals.
    originals: dict[str, "LocString"] = {}
    for json_file in sorted(backup_dir.glob("*.json")):
        originals.update(gdata_extractor._extract_gdata_file(json_file))

    # Merge: if the live entry has only English, add the original Chinese.
    for key, orig in originals.items():
        if key not in strings:
            continue
        live = strings[key]
        if "Chinese" not in live.translations and "Chinese" in orig.translations:
            live.translations["Chinese"] = orig.translations["Chinese"]


def _get_mod_csv_paths(mod_path: Path) -> list[Path]:
    """Collect all CSV file paths for a mod.

    Gathers CSVs from the `Localization/` subdirectory and any top-level
    `Lang*.csv` files in the mod root.

    Args:
        mod_path: Filesystem path to the mod's root directory.

    Returns:
        A list of `Path` objects pointing to each discovered CSV file.
    """
    paths = []
    loc_dir = mod_path / "Localization"
    if loc_dir.exists():
        paths.extend(loc_dir.glob("*.csv"))
    paths.extend(mod_path.glob("Lang*.csv"))
    return paths


def _compute_export_snapshot(mod_id: str, mod_path: Path) -> str:
    """
    Compute a hash representing the current state of translations + mod CSVs.

    Combines the translations.json content with the mod's CSV file contents
    so we can detect changes on either side (new translations or mod author updates).
    """
    h = hashlib.sha256()

    # Hash translation text content only (excludes timestamps so metadata
    # changes don't trigger a false "needs export" signal).
    flat = load_translations(mod_id)
    if flat:
        h.update(json.dumps(flat, sort_keys=True).encode("utf-8"))

    # Hash each mod CSV file.
    for csv_path in sorted(_get_mod_csv_paths(mod_path)):
        h.update(csv_path.name.encode("utf-8"))
        h.update(csv_path.read_bytes())

    return h.hexdigest()


def _load_last_export_hash(mod_id: str) -> str:
    """Load the snapshot hash saved after the last successful export.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The hex-digest hash string, or an empty string if no export has
        been recorded yet.
    """
    path = config.STORAGE_PATH / "mods" / mod_id / "last_export.json"
    if not path.exists():
        return ""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("hash", "")
    except Exception:
        return ""


def _save_last_export_hash(mod_id: str, snapshot_hash: str) -> None:
    """Save the snapshot hash after a successful export.

    Args:
        mod_id: The workshop identifier of the mod.
        snapshot_hash: The hex-digest hash string to persist.
    """
    path = config.STORAGE_PATH / "mods" / mod_id / "last_export.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"hash": snapshot_hash}, f)


def _find_mod_path(mod_id: str) -> Path:
    """Find the mod directory path by scanning all workshop mods.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The filesystem `Path` to the mod's root directory.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    return matching[0].path


@app.get("/api/mods/{mod_id}/export-status")
async def get_export_status(mod_id: str):
    """Check whether there are changes to sync to the mod's CSV files.

    Compares the current translation and CSV state against the last
    successful export snapshot to determine if a re-export is needed.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with a single `has_changes` boolean.
    """
    mod_path = _find_mod_path(mod_id)

    # No translations at all — nothing to sync.
    translations = load_translations(mod_id)
    if not translations:
        return {"has_changes": False}

    # Compare current snapshot against last export.
    current_hash = _compute_export_snapshot(mod_id, mod_path)
    last_hash = _load_last_export_hash(mod_id)

    return {
        "has_changes": current_hash != last_hash,
        "has_previous_sync": last_hash != "",
    }


@app.post("/api/mods/{mod_id}/open-source-file/{filename}")
async def open_source_file(mod_id: str, filename: str):
    """Open a mod's source file in the OS default application.

    Looks for the file in the mod's Localization directory (for CSVs) or
    gdata/Add directory (for JSONs), then opens it with `os.startfile`.

    Args:
        mod_id: The workshop identifier of the mod.
        filename: The source filename (e.g. `LangDataDB.csv` or `B_Roland_Rare_S.json`).

    Returns:
        A dict with the resolved file path.

    Raises:
        HTTPException: 404 if the file is not found in the mod directory.
    """
    mod_path = _find_mod_path(mod_id)

    candidates = [
        mod_path / "Localization" / filename,
        mod_path / "gdata" / "Add" / filename,
        mod_path / filename,
    ]

    for candidate in candidates:
        if candidate.is_file():
            os.startfile(candidate)
            return {"path": str(candidate)}

    raise HTTPException(status_code=404, detail=f"Source file not found: {filename}")


@app.post("/api/open-base-game-file/{filename}")
async def open_base_game_file(filename: str):
    """Open Explorer to the base game source file's location with it selected.

    Args:
        filename: The source filename (e.g. `LangDataDB.csv`).

    Returns:
        A dict with the resolved file path.

    Raises:
        HTTPException: 400 if base game path is not configured, 404 if
            the file is not found.
    """
    base_path = _adapter.base_game_path
    if base_path is None:
        raise HTTPException(status_code=400, detail="Base game path not configured")

    candidate = base_path / filename
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail=f"Base game file not found: {filename}")

    subprocess.Popen(["explorer", "/select,", str(candidate)])
    return {"path": str(candidate)}


@app.post("/api/mods/{mod_id}/export")
async def export_mod(mod_id: str, resync: bool = False):
    """Write saved translations back into the mod's original CSV files.

    Applies all stored English translations to the mod's localization CSVs,
    removes any duplicate variant files, and records an export snapshot so
    subsequent `get_export_status` calls can detect new changes.

    When `resync` is True, the original CSV and gdata files are restored
    from backups first so that translations are applied on top of a clean
    base.  This is useful when no new changes exist but the user wants to
    re-apply translations from scratch.

    Args:
        mod_id: The workshop identifier of the mod.
        resync: If True, restore original files before re-exporting.

    Returns:
        A dict with `status`, the number of `applied` translations,
        `files_written` (list of CSV filenames updated), and
        `files_removed` (list of variant file paths deleted).

    Raises:
        HTTPException: 400 if no translations exist for the mod.
        HTTPException: 404 if the mod is not found.
    """
    mod_path = _find_mod_path(mod_id)

    original_csv_dir = config.STORAGE_PATH / "mods" / mod_id / "original_csvs"
    original_gdata_dir = config.STORAGE_PATH / "mods" / mod_id / "original_gdata"

    if resync:
        # Restore original CSV files from backups so we re-apply on a
        # clean base.
        if original_csv_dir.exists():
            for src in original_csv_dir.rglob("*"):
                if src.is_file():
                    rel = src.relative_to(original_csv_dir)
                    dest = mod_path / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dest)

        # Restore original gdata JSON files from backups.
        if original_gdata_dir.exists():
            gdata_dest = mod_path / "gdata" / "Add"
            gdata_dest.mkdir(parents=True, exist_ok=True)
            for src in original_gdata_dir.rglob("*"):
                if src.is_file():
                    shutil.copy2(src, gdata_dest / src.name)
    else:
        # Save a backup of the original CSV files before the first export so
        # "Reset" can restore them later.
        if not original_csv_dir.exists():
            original_csv_dir.mkdir(parents=True, exist_ok=True)
            for csv_path in _get_mod_csv_paths(mod_path):
                # Preserve relative path structure (Localization/file.csv vs file.csv)
                rel = csv_path.relative_to(mod_path)
                dest = original_csv_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(csv_path, dest)

        # Save a backup of the original gdata JSON files before the first export.
        gdata_src = mod_path / "gdata" / "Add"
        if not original_gdata_dir.exists() and gdata_src.exists():
            original_gdata_dir.mkdir(parents=True, exist_ok=True)
            for json_path in gdata_src.glob("*.json"):
                shutil.copy2(json_path, original_gdata_dir / json_path.name)

    # Load saved translations.
    translations = load_translations(mod_id)
    if not translations:
        raise HTTPException(status_code=400, detail="No translations found for this mod")

    # Extract current strings from the mod.
    strings, variant_files = _adapter.extract_strings(mod_path)

    # Capture pre-export English values so we can show a diff in the UI.
    pre_export_english = {key: loc_str.translations.get("English", "") for key, loc_str in strings.items() if key in translations}

    # Apply translations to the English column.
    applied = 0
    for key, english in translations.items():
        if key in strings:
            strings[key].translations["English"] = english
            applied += 1

    # Separate gdata JSON-sourced strings from CSV/DLL-sourced strings.
    # JSON strings get written back into the original gdata files; the
    # rest go into standard localization CSVs.
    gdata_translations: dict[str, str] = {}
    by_source: dict[str, list] = {}
    for key, loc_str in strings.items():
        source = loc_str.source_file or _adapter.csv_for_key(loc_str.key)
        if source.lower().endswith(".json"):
            english = loc_str.translations.get("English", "")
            if english:
                gdata_translations[key] = english
        else:
            if source.lower().endswith(".dll"):
                source = _adapter.csv_for_key(loc_str.key)
            if source not in by_source:
                by_source[source] = []
            by_source[source].append(loc_str)

    files_written = []
    gdata_files_written = []

    # Write gdata JSON translations back into the original files.
    if gdata_translations:
        gdata_files_written = _adapter.export_gdata_strings(mod_path, gdata_translations)

    # Write CSV-sourced and DLL-sourced strings to localization CSVs.
    for csv_filename, entries in by_source.items():

        # Determine the original file path.
        loc_path = mod_path / "Localization" / csv_filename
        top_path = mod_path / csv_filename
        if loc_path.exists():
            output_path = loc_path
        elif top_path.exists():
            output_path = top_path
        else:
            # Default to Localization subdirectory.
            (mod_path / "Localization").mkdir(parents=True, exist_ok=True)
            output_path = loc_path

        _adapter.export_strings(output_path, entries)
        files_written.append(csv_filename)

    # Consolidate: delete variant files.
    files_removed = []
    if variant_files:
        for variant_rel in variant_files:
            variant_path = mod_path / variant_rel
            if variant_path.exists():
                variant_path.unlink()
                files_removed.append(variant_rel)

        # Clean up empty backup directories.
        for subdir in mod_path.iterdir():
            if subdir.is_dir() and subdir.name not in ("Localization", "Assemblies"):
                try:
                    if not any(subdir.iterdir()):
                        subdir.rmdir()
                except (OSError, StopIteration):
                    pass

        loc_dir = mod_path / "Localization"
        if loc_dir.exists():
            for subdir in loc_dir.iterdir():
                if subdir.is_dir():
                    try:
                        if not any(subdir.iterdir()):
                            subdir.rmdir()
                    except (OSError, StopIteration):
                        pass

    # Save snapshot hash so export-status knows we're in sync.
    snapshot_hash = _compute_export_snapshot(mod_id, mod_path)
    _save_last_export_hash(mod_id, snapshot_hash)

    # Save the set of synced keys so the UI can highlight them.
    synced_keys_path = config.STORAGE_PATH / "mods" / mod_id / "synced_keys.json"
    synced_keys_path.parent.mkdir(parents=True, exist_ok=True)
    with open(synced_keys_path, "w", encoding="utf-8") as f:
        json.dump(list(translations.keys()), f, ensure_ascii=False)

    # Save pre-export English values so the UI can show a diff for synced rows.
    pre_export_path = config.STORAGE_PATH / "mods" / mod_id / "pre_export_english.json"
    with open(pre_export_path, "w", encoding="utf-8") as f:
        json.dump(pre_export_english, f, ensure_ascii=False)

    return {
        "status": "success",
        "applied": applied,
        "files_written": files_written,
        "gdata_files_written": gdata_files_written,
        "files_removed": files_removed,
    }


def _find_mod_preview_image(mod_path: Path) -> Optional[Path]:
    """Find a preview image in the mod's root directory.

    Searches for `.png`, `.jpg`, and `.jpeg` files and returns the
    first match found.

    Args:
        mod_path: Filesystem path to the mod's root directory.

    Returns:
        The `Path` to the first image found, or `None` if the mod has
        no preview image.
    """
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for img in mod_path.glob(ext):
            return img
    return None


@app.get("/api/mods/{mod_id}/character-context")
async def get_character_context(mod_id: str):
    """Return saved character context for a mod.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `source_game`, `character_name`, and `background`
        fields (all strings, possibly empty).
    """
    return load_character_context(mod_id)


@app.post("/api/mods/{mod_id}/character-context")
async def set_character_context(mod_id: str, ctx: CharacterContext):
    """Save character context for a mod.

    Args:
        mod_id: The workshop identifier of the mod.
        ctx: The character context data to persist.

    Returns:
        A dict with `{"status": "saved"}`.
    """
    save_character_context(mod_id, ctx.model_dump())
    return {"status": "saved"}


@app.get("/api/glossary")
async def get_glossary():
    """Get all terminology glossary entries.

    Returns:
        The full global glossary dict as stored on disk, containing a
        `terms` mapping of English terms to their source-language
        mappings.
    """
    glossary = load_glossary()
    return glossary


@app.post("/api/glossary")
async def update_glossary(term: GlossaryTerm):
    """Add or update a glossary term.

    Args:
        term: The glossary term to add, containing the source text and its
            English translation.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_glossary()
    add_glossary_term(glossary, term.english, {"custom": term.source})
    save_glossary(glossary)
    return {"status": "success"}


@app.get("/api/mods/{mod_id}/glossary")
async def get_mod_glossary(mod_id: str):
    """Get a mod's glossary terms.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The mod-specific glossary dict containing a `terms` mapping.
    """
    return load_mod_glossary(mod_id)


@app.post("/api/mods/{mod_id}/glossary")
async def update_mod_glossary(mod_id: str, term: ModGlossaryTerm):
    """Add or update a term in a mod's glossary.

    Args:
        mod_id: The workshop identifier of the mod.
        term: The glossary term containing the English text, per-language
            source mappings, and category.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_mod_glossary(mod_id)
    add_glossary_term(glossary, term.english, term.source_mappings, term.category)
    save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@app.delete("/api/mods/{mod_id}/glossary/{term}")
async def delete_mod_glossary_term(mod_id: str, term: str):
    """Remove a term from a mod's glossary.

    If the term does not exist, the operation is a no-op.

    Args:
        mod_id: The workshop identifier of the mod.
        term: The English term string to delete.

    Returns:
        A dict with `{"status": "success"}`.
    """
    glossary = load_mod_glossary(mod_id)
    if term in glossary.get("terms", {}):
        del glossary["terms"][term]
        save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


class GlossaryReplacePreview(BaseModel):
    """Request body for previewing glossary term replacements.

    Attributes:
        old_english: The current English term to find in translations.
        new_english: The replacement English term.
    """

    old_english: str
    new_english: str


@app.post("/api/mods/{mod_id}/glossary/replace-preview")
async def glossary_replace_preview(mod_id: str, req: GlossaryReplacePreview):
    """Preview which translations would be affected by a glossary term replacement.

    Args:
        mod_id: The workshop identifier of the mod.
        req: The old and new English terms.

    Returns:
        A dict with `affected` (list of dicts with key, old_text, new_text).
    """
    translations = load_translations(mod_id)
    if not translations:
        return {"affected": []}

    affected = []
    for key, english in translations.items():
        if req.old_english in english:
            new_text = english.replace(req.old_english, req.new_english)
            if new_text != english:
                affected.append({"key": key, "old_text": english, "new_text": new_text})

    return {"affected": affected}


@app.post("/api/mods/{mod_id}/glossary/replace-apply")
async def glossary_replace_apply(mod_id: str, req: GlossaryReplacePreview):
    """Apply a glossary term replacement across all translations.

    Args:
        mod_id: The workshop identifier of the mod.
        req: The old and new English terms.

    Returns:
        A dict with `status` and the count of `replaced` translations.
    """
    # Back up before applying replacements.
    create_backup(mod_id, f"Before replacing '{req.old_english}' with '{req.new_english}'")

    replaced = replace_in_translations(mod_id, req.old_english, req.new_english)

    return {"status": "success", "replaced": replaced}


@app.get("/api/mods/{mod_id}/glossary/merged")
async def get_merged_glossary(mod_id: str):
    """Get the merged base + mod glossary.

    Combines the global glossary with the mod-specific glossary, with
    mod-level terms taking precedence on conflicts.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The merged glossary dict ready for use in translation prompts.
    """
    base = load_glossary()
    mod = load_mod_glossary(mod_id)
    return merge_glossaries(base, mod)


@app.get("/api/mods/{mod_id}/glossary/suggestions")
async def get_suggestions(mod_id: str):
    """Get pending glossary term suggestions.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A list of suggestion dicts, each containing `english`,
        `source`, `source_lang`, and `category` fields.
    """
    return load_suggestions(mod_id)


@app.post("/api/mods/{mod_id}/glossary/suggestions/accept")
async def accept_suggestions(mod_id: str, action: SuggestionAction):
    """Accept suggestions into the mod glossary.

    Moves the specified (or all) pending suggestions into the mod's
    glossary and removes them from the suggestions list.

    Args:
        mod_id: The workshop identifier of the mod.
        action: Specifies which suggestions to accept, either by listing
            specific terms or setting `all` to `True`.

    Returns:
        A dict with `status` and the count of `accepted` terms.
    """
    suggestions = load_suggestions(mod_id)
    glossary = load_mod_glossary(mod_id)

    terms_to_accept = {s["english"] for s in suggestions} if action.all else set(action.terms)

    for suggestion in suggestions:
        if suggestion.get("english") in terms_to_accept:
            add_glossary_term(
                glossary,
                suggestion["english"],
                {suggestion.get("source_lang", "unknown"): suggestion.get("source", "")},
                suggestion.get("category", "custom"),
            )

    save_mod_glossary(mod_id, glossary)
    remove_suggestions(mod_id, list(terms_to_accept))
    return {"status": "success", "accepted": len(terms_to_accept)}


@app.post("/api/mods/{mod_id}/glossary/suggestions/dismiss")
async def dismiss_suggestions(mod_id: str, action: SuggestionAction):
    """Dismiss (remove) suggestions without adding to glossary.

    Args:
        mod_id: The workshop identifier of the mod.
        action: Specifies which suggestions to dismiss, either by listing
            specific terms or setting `all` to `True`.

    Returns:
        A dict with `{"status": "success"}`.
    """
    if action.all:
        clear_suggestions(mod_id)
    else:
        remove_suggestions(mod_id, action.terms)
    return {"status": "success"}


@app.get("/api/mods/{mod_id}/history")
async def get_history(mod_id: str):
    """List all available backup snapshots for a mod, newest first.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A list of backup metadata dicts with id, reason, created_at, and files.
    """
    return list_backups(mod_id)


@app.post("/api/mods/{mod_id}/history/{backup_id}/restore")
async def restore_history(mod_id: str, backup_id: str):
    """Restore a mod's state from a backup snapshot.

    Creates a backup of the current state first, then restores the
    selected snapshot.

    Args:
        mod_id: The workshop identifier of the mod.
        backup_id: The timestamp ID of the backup to restore.

    Returns:
        A dict with `{"status": "success"}` on success.

    Raises:
        HTTPException: 404 if the backup was not found.
    """
    if not restore_backup(mod_id, backup_id):
        raise HTTPException(status_code=404, detail="Backup not found")
    return {"status": "success"}


@app.delete("/api/mods/{mod_id}/history/{backup_id}")
async def delete_history(mod_id: str, backup_id: str):
    """Delete a specific backup snapshot.

    Args:
        mod_id: The workshop identifier of the mod.
        backup_id: The timestamp ID of the backup to delete.

    Returns:
        A dict with `{"status": "success"}` on success.
    """
    delete_backup(mod_id, backup_id)
    return {"status": "success"}


@app.get("/api/mods/{mod_id}/api-responses")
async def get_api_responses(mod_id: str):
    """Get the raw API responses from the last translation run.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A list of response dicts, each containing batch_index, model,
        input_tokens, output_tokens, and raw_text.
    """
    responses_path = config.STORAGE_PATH / "mods" / mod_id / "last_api_responses.json"
    if not responses_path.exists():
        return []
    with open(responses_path, "r", encoding="utf-8") as f:
        return json.load(f)


_ENV_PATH = Path(__file__).parent / ".env"


def _mask_key(key: str) -> str:
    """Return a masked version of an API key, or empty string if unset."""
    if not key or not key.strip():
        return ""
    return "••••" + key[-4:]


def _update_env_file(updates: dict[str, str]) -> None:
    """Write updated CATL_* values to the .env file and os.environ.

    Reads the existing .env line-by-line, replacing matching keys in place
    to preserve comments and ordering. Keys not already present are appended
    at the end. Also updates `os.environ` so the running process sees the
    new values immediately.

    Args:
        updates: Mapping of env-var names (e.g. `CATL_BATCH_SIZE`) to their
            new string values.
    """
    lines: list[str] = []
    if _ENV_PATH.exists():
        lines = _ENV_PATH.read_text(encoding="utf-8").splitlines(keepends=True)

    # Replace existing keys in place; track which ones we found.
    found_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0]
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                found_keys.add(key)
                continue
        new_lines.append(line if line.endswith("\n") else line + "\n")

    # Append any keys that weren't already in the file.
    for key, value in updates.items():
        if key not in found_keys:
            new_lines.append(f"{key}={value}\n")

    _ENV_PATH.write_text("".join(new_lines), encoding="utf-8")

    # Mirror into os.environ so config reads are consistent within the
    # current process without needing a restart.
    for key, value in updates.items():
        os.environ[key] = value


# ── Ollama Management ─────────────────────────────────────────────────────────


async def _check_ollama_status() -> str:
    """Check if Ollama is installed and running.

    Returns:
        `"running"` if the Ollama API responds, `"stopped"` if the binary
        exists on PATH but the API is unreachable, or `"not_installed"`
        if neither is detected.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=1.0)
        if resp.status_code == 200:
            return "running"
        return "stopped"
    except httpx.ConnectError:
        if shutil.which("ollama") is not None:
            return "stopped"
        return "not_installed"
    except Exception:
        return "stopped"


@app.get("/api/ollama/status")
async def get_ollama_status():
    """Check Ollama installation status and list available models.

    Returns:
        A dict with `status`, `models` list, `base_url`, and `managed` flag.
    """
    status = await _check_ollama_status()
    models: list[dict] = []
    if status == "running":
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                models = [{"name": m["name"], "size": m.get("size", 0), "modified_at": m.get("modified_at", "")} for m in data.get("models", [])]
        except Exception:
            pass
    return {"status": status, "models": models, "base_url": config.OLLAMA_BASE_URL, "managed": is_managed("ollama")}


@app.get("/api/ollama/models")
async def get_ollama_models():
    """List models currently downloaded in Ollama.

    Returns:
        A dict with a `models` list.

    Raises:
        HTTPException: 502 if Ollama returns a non-200 status.
        HTTPException: 503 if Ollama is not reachable.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=3.0)
        if resp.status_code == 200:
            data = resp.json()
            return {"models": data.get("models", [])}
        raise HTTPException(502, "Ollama returned non-200 status")
    except httpx.ConnectError:
        raise HTTPException(503, "Cannot connect to Ollama. Is it running?")


class OllamaPullRequest(BaseModel):
    """Request body for POST /api/ollama/pull."""

    model: str


@app.post("/api/ollama/pull")
async def pull_ollama_model(req: OllamaPullRequest):
    """Pull (download) an Ollama model with streaming progress via SSE.

    Args:
        req: The pull request containing the model name.

    Returns:
        A `StreamingResponse` emitting SSE progress events.
    """

    async def event_stream():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{config.OLLAMA_BASE_URL}/api/pull",
                json={"name": req.model, "stream": True},
            ) as response:
                async for line in response.aiter_lines():
                    if line.strip():
                        yield f"data: {line}\n\n"
        yield 'data: {"status": "done"}\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/ollama/install")
async def install_ollama():
    """Download and launch the official Ollama Windows installer.

    Returns:
        A dict with `success` and `message` fields.

    Raises:
        HTTPException: 500 if the download or launch fails.
    """
    if await _check_ollama_status() == "running":
        return {"success": True, "message": "Ollama is already installed and running."}

    try:
        installer_url = "https://ollama.com/download/OllamaSetup.exe"
        temp_dir = tempfile.mkdtemp()
        installer_path = os.path.join(temp_dir, "OllamaSetup.exe")

        await asyncio.to_thread(urllib.request.urlretrieve, installer_url, installer_path)

        subprocess.Popen([installer_path], shell=False)

        return {"success": True, "message": "Installer launched. Complete the installation wizard, then check status again."}
    except Exception as e:
        raise HTTPException(500, f"Failed to download/launch installer: {e}")


@app.post("/api/ollama/start")
async def start_ollama():
    """Start `ollama serve` as a managed background process.

    Returns:
        A dict with `success`, `message`, and `managed` fields.

    Raises:
        HTTPException: 400 if Ollama is not installed.
        HTTPException: 500 if the process fails to start.
    """
    status = await _check_ollama_status()
    if status == "running":
        return {"success": True, "message": "Ollama is already running.", "managed": is_managed("ollama")}
    if status == "not_installed":
        raise HTTPException(400, "Ollama is not installed. Install it first.")

    log_dir = config.STORAGE_PATH / "logs"
    success, message = await asyncio.to_thread(start_process, "ollama", ["ollama", "serve"], log_dir)
    if not success:
        raise HTTPException(500, message)

    for _ in range(10):
        await asyncio.sleep(0.5)
        if await _check_ollama_status() == "running":
            return {"success": True, "message": message, "managed": True}

    return {"success": True, "message": message + " (server may still be starting)", "managed": True}


@app.post("/api/ollama/stop")
async def stop_ollama():
    """Stop a managed Ollama process.

    Returns:
        A dict with `success` and `message` fields.

    Raises:
        HTTPException: 400 if Ollama was not started by this app.
        HTTPException: 500 if the process fails to stop.
    """
    if not is_managed("ollama"):
        raise HTTPException(400, "Ollama was not started by this app. Stop it manually.")
    success, message = await asyncio.to_thread(stop_process, "ollama")
    if not success:
        raise HTTPException(500, message)
    return {"success": True, "message": message}


# ── llama.cpp ─────────────────────────────────────────────────────────────────


def _llamacpp_binary() -> Path | None:
    """Return the path to llama-server if it exists, or None."""
    # Check configured path first
    configured = Path(config.LLAMACPP_BINARY_PATH)
    if configured.is_file():
        return configured
    # Check managed install location
    managed = config.STORAGE_PATH / "bin" / "llama-server.exe"
    if managed.is_file():
        return managed
    # Check PATH
    found = shutil.which("llama-server")
    if found:
        return Path(found)
    return None


@app.get("/api/llamacpp/status")
async def get_llamacpp_status():
    """Check whether llama-server is reachable and installed.

    Returns:
        A dict with `status`, `installed`, `binary_path`, `base_url`,
        and `managed` fields.
    """
    installed = _llamacpp_binary() is not None
    running = False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.LLAMACPP_BASE_URL}/health", timeout=2.0)
        if resp.status_code == 200:
            running = True
    except Exception:
        pass
    return {
        "status": "running" if running else "not_running",
        "installed": installed,
        "binary_path": str(_llamacpp_binary() or ""),
        "base_url": config.LLAMACPP_BASE_URL,
        "managed": is_managed("llamacpp"),
    }


# GPU backend options for llama-server binary downloads.
_LLAMACPP_BACKENDS = {
    "cuda-13": {"label": "NVIDIA GPU (CUDA 13.1 — RTX 40/50 series)", "zip_pattern": "bin-win-cuda-13.1-x64", "cudart_pattern": "cudart-llama-bin-win-cuda-13.1-x64"},
    "cuda-12": {"label": "NVIDIA GPU (CUDA 12.4 — RTX 20/30 series)", "zip_pattern": "bin-win-cuda-12.4-x64", "cudart_pattern": "cudart-llama-bin-win-cuda-12.4-x64"},
    "vulkan": {"label": "Any GPU (Vulkan)", "zip_pattern": "bin-win-vulkan-x64", "cudart_pattern": None},
    "cpu": {"label": "CPU only", "zip_pattern": "bin-win-cpu-x64", "cudart_pattern": None},
}


class LlamaCppInstallRequest(BaseModel):
    """Request body for POST /api/llamacpp/install."""

    backend: str = "vulkan"


@app.post("/api/llamacpp/install")
async def install_llamacpp(req: LlamaCppInstallRequest):
    """Download and extract llama-server from the latest GitHub release with SSE progress.

    Args:
        req: The install request specifying the GPU backend to download.

    Returns:
        A `StreamingResponse` emitting SSE progress events.

    Raises:
        HTTPException: 400 if the backend is not recognized.
    """
    if req.backend not in _LLAMACPP_BACKENDS:
        raise HTTPException(400, f"Invalid backend: {req.backend}. Choose from: {', '.join(_LLAMACPP_BACKENDS)}")

    backend_info = _LLAMACPP_BACKENDS[req.backend]
    bin_dir = config.STORAGE_PATH / "bin"

    async def event_stream():
        import zipfile
        import io

        try:
            yield f'data: {json.dumps({"status": "fetching_release"})}\n\n'

            async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(30.0, read=None), headers={"User-Agent": "curl/8.0"}) as client:
                # Find latest release
                r = await client.get("https://api.github.com/repos/ggerganov/llama.cpp/releases/latest")
                if r.status_code != 200:
                    yield f'data: {json.dumps({"status": "error", "message": f"GitHub API error: HTTP {r.status_code}"})}\n\n'
                    return
                release = r.json()
                tag = release["tag_name"]
                assets = release.get("assets", [])

                # Find the right zip (exclude cudart zips which are a separate download)
                zip_asset = next((a for a in assets if backend_info["zip_pattern"] in a["name"] and a["name"].endswith(".zip") and not a["name"].startswith("cudart")), None)
                if not zip_asset:
                    yield f'data: {json.dumps({"status": "error", "message": f"No {backend_info['label']} build found in release {tag}"})}\n\n'
                    return

                # Download main zip
                zip_url = zip_asset["browser_download_url"]
                zip_total = zip_asset["size"]
                yield f'data: {json.dumps({"status": "downloading", "file": zip_asset["name"], "completed": 0, "total": zip_total})}\n\n'

                zip_data = bytearray()
                async with client.stream("GET", zip_url) as resp:
                    async for chunk in resp.aiter_bytes(1024 * 1024):
                        zip_data.extend(chunk)
                        if len(zip_data) % (5 * 1024 * 1024) < 1024 * 1024:
                            yield f'data: {json.dumps({"status": "downloading", "file": zip_asset["name"], "completed": len(zip_data), "total": zip_total})}\n\n'
                yield f'data: {json.dumps({"status": "downloading", "file": zip_asset["name"], "completed": len(zip_data), "total": zip_total})}\n\n'

                # Download CUDA runtime if needed
                cudart_data = None
                if backend_info["cudart_pattern"]:
                    cudart_asset = next((a for a in assets if backend_info["cudart_pattern"] in a["name"] and a["name"].endswith(".zip")), None)
                    if cudart_asset:
                        cudart_url = cudart_asset["browser_download_url"]
                        cudart_total = cudart_asset["size"]
                        yield f'data: {json.dumps({"status": "downloading", "file": cudart_asset["name"], "completed": 0, "total": cudart_total})}\n\n'
                        cudart_data = bytearray()
                        async with client.stream("GET", cudart_url) as resp:
                            async for chunk in resp.aiter_bytes(1024 * 1024):
                                cudart_data.extend(chunk)
                                if len(cudart_data) % (10 * 1024 * 1024) < 1024 * 1024:
                                    yield f'data: {json.dumps({"status": "downloading", "file": cudart_asset["name"], "completed": len(cudart_data), "total": cudart_total})}\n\n'
                        yield f'data: {json.dumps({"status": "downloading", "file": cudart_asset["name"], "completed": len(cudart_data), "total": cudart_total})}\n\n'

            # Extract
            yield f'data: {json.dumps({"status": "extracting"})}\n\n'
            bin_dir.mkdir(parents=True, exist_ok=True)

            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                for member in zf.namelist():
                    if member.endswith((".exe", ".dll")):
                        filename = os.path.basename(member)
                        target = bin_dir / filename
                        target.write_bytes(zf.read(member))

            if cudart_data:
                with zipfile.ZipFile(io.BytesIO(cudart_data)) as zf:
                    for member in zf.namelist():
                        if member.endswith(".dll"):
                            filename = os.path.basename(member)
                            target = bin_dir / filename
                            if not target.exists():
                                target.write_bytes(zf.read(member))

            # Update config to point to the installed binary
            binary_path = str(bin_dir / "llama-server.exe")
            config.LLAMACPP_BINARY_PATH = binary_path
            _update_env_file({"CATL_LLAMACPP_BINARY_PATH": binary_path})

            print(f"[llamacpp] Installed {tag} ({backend_info['label']}) to {bin_dir}")
            yield f'data: {json.dumps({"status": "done", "tag": tag, "binary_path": binary_path})}\n\n'

        except Exception as e:
            print(f"[llamacpp] Install error: {e}")
            yield f'data: {json.dumps({"status": "error", "message": str(e)})}\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _ensure_llamacpp_running() -> None:
    """Start llama-server if it isn't already running.

    Called automatically before translation so the user doesn't need to
    manually start the server.  If the server is already healthy this is a
    no-op.

    Raises:
        HTTPException: If the server cannot be started or fails health checks.
    """
    # Already running (externally or managed) — nothing to do.
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config.LLAMACPP_BASE_URL}/health", timeout=2.0)
        if resp.status_code == 200:
            return
    except Exception:
        pass

    model_path = config.LLAMACPP_MODEL_PATH
    if not model_path:
        raise HTTPException(400, "Model path is required. Select and download a model first.")

    binary = _llamacpp_binary()
    if not binary:
        raise HTTPException(400, "llama-server is not installed. Install it first.")

    from urllib.parse import urlparse

    parsed = urlparse(config.LLAMACPP_BASE_URL)
    port = str(parsed.port or 8080)

    ctx_size = config.LLAMACPP_CTX_SIZE

    args = [
        str(binary),
        "--model",
        model_path,
        "--port",
        port,
        "--n-gpu-layers",
        str(config.LLAMACPP_GPU_LAYERS),
        "--ctx-size",
        str(ctx_size),
    ]

    log_dir = config.STORAGE_PATH / "logs"
    success, message = await asyncio.to_thread(start_process, "llamacpp", args, log_dir)
    if not success:
        raise HTTPException(500, message)

    # llama-server can take a while to load models.
    for _ in range(60):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{config.LLAMACPP_BASE_URL}/health", timeout=2.0)
            if resp.status_code == 200:
                return
        except Exception:
            if not is_managed("llamacpp"):
                raise HTTPException(500, "llama-server exited unexpectedly. Check logs in storage/logs/.")

    raise HTTPException(500, "llama-server did not become healthy within 60 seconds.")


@app.post("/api/llamacpp/start")
async def start_llamacpp():
    """Start llama-server as a managed background process.

    Returns:
        A dict with `success` and `managed` fields.

    Raises:
        HTTPException: 400 if the model path is missing or llama-server is
            not installed.
        HTTPException: 500 if the server fails to start or become healthy.
    """
    await _ensure_llamacpp_running()
    return {"success": True, "managed": is_managed("llamacpp")}


@app.post("/api/llamacpp/stop")
async def stop_llamacpp():
    """Stop a managed llama-server process.

    Returns:
        A dict with `success` and `message` fields.

    Raises:
        HTTPException: 400 if llama-server was not started by this app.
        HTTPException: 500 if the process fails to stop.
    """
    if not is_managed("llamacpp"):
        raise HTTPException(400, "llama-server was not started by this app. Stop it manually.")
    success, message = await asyncio.to_thread(stop_process, "llamacpp")
    if not success:
        raise HTTPException(500, message)
    return {"success": True, "message": message}


@app.get("/api/llamacpp/models")
async def list_llamacpp_models():
    """List GGUF model files in the local models directory.

    Returns:
        A dict with a `models` list and `models_dir` path string.
    """
    models_dir = config.LLAMACPP_MODELS_DIR
    if not models_dir.exists():
        return {"models": [], "models_dir": str(models_dir)}
    models = []
    for f in sorted(models_dir.glob("*.gguf")):
        models.append({"name": f.name, "path": str(f), "size": f.stat().st_size})
    return {"models": models, "models_dir": str(models_dir)}


class GGUFDownloadRequest(BaseModel):
    """Request body for POST /api/llamacpp/download."""

    url: str
    filename: str


# Active download cancel events keyed by filename.
_gguf_download_cancels: dict[str, asyncio.Event] = {}


@app.post("/api/llamacpp/download")
async def download_gguf_model(req: GGUFDownloadRequest):
    """Download a GGUF model file from a URL with streaming progress via SSE.

    Args:
        req: The download request containing the URL and target filename.

    Returns:
        A `StreamingResponse` emitting SSE progress events.
    """
    models_dir = config.LLAMACPP_MODELS_DIR
    models_dir.mkdir(parents=True, exist_ok=True)
    dest = models_dir / req.filename

    cancel_event = asyncio.Event()
    _gguf_download_cancels[req.filename] = cancel_event

    async def event_stream():
        try:
            if dest.is_file():
                print(f"[gguf] Already exists: {dest}")
                yield f'data: {json.dumps({"status": "done", "path": str(dest), "completed": 0, "total": 0})}\n\n'
                return

            print(f"[gguf] Starting download: {req.url}")
            print(f"[gguf] Destination: {dest}")
            yield f'data: {json.dumps({"status": "connecting"})}\n\n'

            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None), follow_redirects=True) as client:
                async with client.stream("GET", req.url) as response:
                    print(f"[gguf] Connected: HTTP {response.status_code}, Content-Length: {response.headers.get('content-length', 'unknown')}")
                    if response.status_code != 200:
                        yield f'data: {json.dumps({"status": "error", "message": f"HTTP {response.status_code}"})}\n\n'
                        return

                    total = int(response.headers.get("content-length", 0))
                    completed = 0
                    last_report = 0
                    yield f'data: {json.dumps({"status": "downloading", "completed": 0, "total": total})}\n\n'

                    partial = dest.parent / (dest.name + ".part")
                    with open(partial, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                            if cancel_event.is_set():
                                yield f'data: {json.dumps({"status": "cancelled"})}\n\n'
                                partial.unlink(missing_ok=True)
                                return

                            f.write(chunk)
                            completed += len(chunk)

                            if completed - last_report >= 2 * 1024 * 1024 or completed == total:
                                yield f'data: {json.dumps({"status": "downloading", "completed": completed, "total": total})}\n\n'
                                last_report = completed

                    partial.rename(dest)
                    print(f"[gguf] Download complete: {dest} ({completed} bytes)")
                    yield f'data: {json.dumps({"status": "done", "path": str(dest), "completed": completed, "total": total})}\n\n'
        except Exception as e:
            print(f"[gguf] Error: {e}")
            (dest.parent / (dest.name + ".part")).unlink(missing_ok=True)
            yield f'data: {json.dumps({"status": "error", "message": str(e)})}\n\n'
        finally:
            _gguf_download_cancels.pop(req.filename, None)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/llamacpp/download/cancel")
async def cancel_gguf_download(req: GGUFDownloadRequest):
    """Cancel an in-progress GGUF download.

    Args:
        req: The download request identifying the file to cancel.

    Returns:
        A dict with `success` and optionally a `message` field.
    """
    event = _gguf_download_cancels.get(req.filename)
    if event:
        event.set()
        return {"success": True}
    return {"success": False, "message": "No active download for this file."}


@app.delete("/api/llamacpp/models/{filename}")
async def delete_llamacpp_model(filename: str):
    """Delete a downloaded GGUF model file.

    Args:
        filename: Name of the GGUF file to delete.

    Returns:
        A dict with `success` and `message` fields.

    Raises:
        HTTPException: 404 if the model file does not exist.
        HTTPException: 400 if the filename is invalid.
    """
    models_dir = config.LLAMACPP_MODELS_DIR
    target = models_dir / filename
    if not target.exists():
        raise HTTPException(404, f"Model not found: {filename}")
    # Safety: ensure we're only deleting from the models directory
    if not target.resolve().parent == models_dir.resolve():
        raise HTTPException(400, "Invalid filename.")
    target.unlink()
    return {"success": True, "message": f"Deleted {filename}"}


# ── Settings ──────────────────────────────────────────────────────────────────


@app.get("/api/settings")
async def get_settings():
    """Return current provider, batch size, masked API key status, and Ollama settings.

    Returns:
        A `SettingsResponse` with all current configuration values.
    """
    return SettingsResponse(
        provider=config.TRANSLATION_PROVIDER,
        batch_size=config.BATCH_SIZE,
        anthropic_api_key_set=_mask_key(config.ANTHROPIC_API_KEY),
        openai_api_key_set=_mask_key(config.OPENAI_API_KEY),
        deepl_api_key_set=_mask_key(config.DEEPL_API_KEY),
        ollama_base_url=config.OLLAMA_BASE_URL,
        ollama_model=config.OLLAMA_MODEL,
        ollama_vram_tier=config.OLLAMA_VRAM_TIER,
        ollama_status="unknown",
        llamacpp_base_url=config.LLAMACPP_BASE_URL,
        llamacpp_model=config.LLAMACPP_MODEL,
        llamacpp_binary_path=config.LLAMACPP_BINARY_PATH,
        llamacpp_model_path=config.LLAMACPP_MODEL_PATH,
        llamacpp_gpu_layers=config.LLAMACPP_GPU_LAYERS,
        llamacpp_ctx_size=config.LLAMACPP_CTX_SIZE,
        llamacpp_vram_tier=config.LLAMACPP_VRAM_TIER,
        ollama_managed=is_managed("ollama"),
        llamacpp_managed=is_managed("llamacpp"),
        ignored_mods=config.IGNORED_MODS,
    )


@app.post("/api/settings")
async def update_settings(payload: SettingsUpdate):
    """Update provider, batch size, and/or API keys. Persists to .env."""
    env_updates: dict[str, str] = {}

    if payload.provider is not None:
        if payload.provider not in ("claude", "openai", "deepl", "ollama", "llamacpp", "manual"):
            raise HTTPException(400, f"Invalid provider: {payload.provider}")
        config.TRANSLATION_PROVIDER = payload.provider
        env_updates["CATL_TRANSLATION_PROVIDER"] = payload.provider

    if payload.batch_size is not None:
        if payload.batch_size < 1:
            raise HTTPException(400, "Batch size must be >= 1")
        config.BATCH_SIZE = payload.batch_size
        env_updates["CATL_BATCH_SIZE"] = str(payload.batch_size)

    if payload.anthropic_api_key is not None:
        config.ANTHROPIC_API_KEY = payload.anthropic_api_key
        env_updates["CATL_ANTHROPIC_API_KEY"] = payload.anthropic_api_key

    if payload.openai_api_key is not None:
        config.OPENAI_API_KEY = payload.openai_api_key
        env_updates["CATL_OPENAI_API_KEY"] = payload.openai_api_key

    if payload.deepl_api_key is not None:
        config.DEEPL_API_KEY = payload.deepl_api_key
        env_updates["CATL_DEEPL_API_KEY"] = payload.deepl_api_key

    if payload.ollama_base_url is not None:
        config.OLLAMA_BASE_URL = payload.ollama_base_url
        env_updates["CATL_OLLAMA_BASE_URL"] = payload.ollama_base_url

    if payload.ollama_model is not None:
        config.OLLAMA_MODEL = payload.ollama_model
        env_updates["CATL_OLLAMA_MODEL"] = payload.ollama_model

    if payload.ollama_vram_tier is not None:
        config.OLLAMA_VRAM_TIER = payload.ollama_vram_tier
        env_updates["CATL_OLLAMA_VRAM_TIER"] = payload.ollama_vram_tier

    if payload.llamacpp_base_url is not None:
        config.LLAMACPP_BASE_URL = payload.llamacpp_base_url
        env_updates["CATL_LLAMACPP_BASE_URL"] = payload.llamacpp_base_url

    if payload.llamacpp_model is not None:
        config.LLAMACPP_MODEL = payload.llamacpp_model
        env_updates["CATL_LLAMACPP_MODEL"] = payload.llamacpp_model

    if payload.llamacpp_binary_path is not None:
        config.LLAMACPP_BINARY_PATH = payload.llamacpp_binary_path
        env_updates["CATL_LLAMACPP_BINARY_PATH"] = payload.llamacpp_binary_path

    if payload.llamacpp_model_path is not None:
        config.LLAMACPP_MODEL_PATH = payload.llamacpp_model_path
        env_updates["CATL_LLAMACPP_MODEL_PATH"] = payload.llamacpp_model_path

    if payload.llamacpp_gpu_layers is not None:
        config.LLAMACPP_GPU_LAYERS = payload.llamacpp_gpu_layers
        env_updates["CATL_LLAMACPP_GPU_LAYERS"] = str(payload.llamacpp_gpu_layers)

    if payload.llamacpp_ctx_size is not None:
        config.LLAMACPP_CTX_SIZE = payload.llamacpp_ctx_size
        env_updates["CATL_LLAMACPP_CTX_SIZE"] = str(payload.llamacpp_ctx_size)

    if payload.llamacpp_vram_tier is not None:
        config.LLAMACPP_VRAM_TIER = payload.llamacpp_vram_tier
        env_updates["CATL_LLAMACPP_VRAM_TIER"] = payload.llamacpp_vram_tier

    if payload.ignored_mods is not None:
        config.IGNORED_MODS = payload.ignored_mods
        env_updates["CATL_IGNORED_MODS"] = ",".join(payload.ignored_mods)

    if env_updates:
        _update_env_file(env_updates)

    return await get_settings()


@app.get("/api/stats")
async def get_stats():
    """Get global statistics for translation memory and progress.

    Returns:
        A dict with `tm_entries` (translation memory size), `tm_hits`
        (session cache hits), `total_mods`, `global_progress`
        (percentage), and `total_strings` across all mods.
    """
    tm = TranslationMemory()
    stats = tm.get_stats()

    # Also count total mods and translation progress
    tracker = ProgressTracker()
    mods = _adapter.scan_mods()

    total_strings = 0
    total_translated = 0

    for mod in mods:
        status = tracker.get_status(mod.mod_id)
        total_strings += status["total"]
        total_translated += status["translated"]

    return {
        "tm_entries": stats["total_entries"],
        "tm_hits": stats["session_hits"],
        "total_mods": len(mods),
        "global_progress": round((total_translated / total_strings * 100), 2) if total_strings > 0 else 0,
        "total_strings": total_strings,
    }


# Mount the workshop directory as static files so preview images are served
# directly without going through a Python endpoint for each request.
# This must be after all route definitions since mounts take priority over
# routes defined after them.
_workshop_path = getattr(_adapter, "_WORKSHOP_PATH", None)
if _workshop_path and Path(_workshop_path).exists():
    app.mount("/api/workshop", StaticFiles(directory=str(_workshop_path)), name="workshop")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_config={
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {"fmt": "%(asctime)s %(levelprefix)s %(message)s", "datefmt": "%Y-%m-%d %H:%M:%S", "use_colors": True, "()": "uvicorn.logging.DefaultFormatter"},
                "access": {
                    "fmt": '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
                    "datefmt": "%Y-%m-%d %H:%M:%S",
                    "use_colors": True,
                    "()": "uvicorn.logging.AccessFormatter",
                },
            },
            "handlers": {
                "default": {"formatter": "default", "class": "logging.StreamHandler", "stream": "ext://sys.stderr"},
                "access": {"formatter": "access", "class": "logging.StreamHandler", "stream": "ext://sys.stdout"},
            },
            "loggers": {
                "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
                "uvicorn.error": {"level": "INFO"},
                "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
            },
        },
    )
