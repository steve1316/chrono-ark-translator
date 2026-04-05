"""
FastAPI backend for Chrono Ark Mod Translation Dashboard.

Provides REST APIs for mod discovery, string extraction, translation status,
glossary management, and triggering translation jobs.
"""

import hashlib
import os
import json
import uvicorn
import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    get_glossary_prompt,
    load_mod_glossary,
    save_mod_glossary,
    merge_glossaries,
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
from backend.main import get_provider, save_extracted_strings


# Initialize the active game adapter.
_adapter: GameAdapter = get_adapter(config.ACTIVE_GAME)

app = FastAPI(title="Chrono Ark Translator API")

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
            }
        )
    return results


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

    # Load existing translations if any
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    translations = {}
    if translations_path.exists():
        try:
            with open(translations_path, "r", encoding="utf-8") as f:
                translations = json.load(f)
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
        is_synced = key in synced_keys
        results.append(
            {
                "key": key,
                "type": loc_str.type,
                "desc": loc_str.desc,
                "source": source_text,
                "source_lang": source_lang,
                "english": english,
                "is_translated": is_done,
                "original_english": original_english_map.get(key, "") if has_override else english,
                "is_synced": is_synced,
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
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    translations_path.parent.mkdir(parents=True, exist_ok=True)

    translations = {}
    if translations_path.exists():
        with open(translations_path, "r", encoding="utf-8") as f:
            translations = json.load(f)

    translations[update.key] = update.english

    with open(translations_path, "w", encoding="utf-8") as f:
        json.dump(translations, f, indent=2, ensure_ascii=False)

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
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    translations_path.parent.mkdir(parents=True, exist_ok=True)
    overrides = {}
    for key, loc_str in strings.items():
        if loc_str.translations.get("English", ""):
            overrides[key] = ""

    # Also clear any previously saved translations.
    if translations_path.exists():
        with open(translations_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        for key in existing:
            overrides[key] = ""

    with open(translations_path, "w", encoding="utf-8") as f:
        json.dump(overrides, f, indent=2, ensure_ascii=False)

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

    try:
        shutil.rmtree(mod_storage)
        return {"status": "success", "csv_restored": csv_restored}
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
    merged = merge_glossaries(base_glossary, mod_glossary)
    game_context = _adapter.get_translation_context()
    char_ctx = load_character_context(req.mod_id)
    character_context = char_ctx if any(char_ctx.values()) else None
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    estimates = {}
    for lang, entries in by_lang.items():
        glossary_prompt = get_glossary_prompt(merged, source_lang=lang)
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

    # Apply saved translations so user edits (including clears) are respected.
    translations_path = config.STORAGE_PATH / "mods" / req.mod_id / "translations.json"
    if translations_path.exists():
        try:
            with open(translations_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for key, english in saved.items():
                if key in strings:
                    strings[key].translations["English"] = english
        except Exception:
            pass

    untranslated = _adapter.get_untranslated(strings)

    if not untranslated:
        return {"total_strings": 0, "message": "All strings already translated", "previews": {}}

    provider_name = req.provider or config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    merged = merge_glossaries(base_glossary, mod_glossary)
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
        glossary_prompt = get_glossary_prompt(merged, source_lang=lang)
        num_batches = (len(entries) + batch_size - 1) // batch_size
        total_batches += num_batches
        first_batch = entries[:batch_size]
        system_prompt, user_message = provider.build_prompt(
            first_batch,
            lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )
        previews[lang] = {
            "system_prompt": system_prompt,
            "user_message": user_message,
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

    return {
        "total_strings": len(untranslated),
        "total_batches": total_batches,
        "batch_size": batch_size,
        "provider": provider.name,
        "previews": previews,
        "estimates": estimates,
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
    translations_path = config.STORAGE_PATH / "mods" / req.mod_id / "translations.json"
    if translations_path.exists():
        try:
            with open(translations_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for key, english in saved.items():
                if key in strings:
                    strings[key].translations["English"] = english
        except Exception:
            pass

    untranslated = _adapter.get_untranslated(strings)

    provider_name = req.provider or config.TRANSLATION_PROVIDER
    provider = get_provider(provider_name)

    if not untranslated:
        return {"status": "complete", "message": "All strings already translated", "translated": 0, "suggestions": 0}

    # Load merged glossary.
    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    merged = merge_glossaries(base_glossary, mod_glossary)
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
            glossary_prompt = get_glossary_prompt(merged, source_lang=lang)
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
        responses_path = config.STORAGE_PATH / "mods" / req.mod_id / "last_api_responses.json"
        responses_path.parent.mkdir(parents=True, exist_ok=True)
        with open(responses_path, "w", encoding="utf-8") as f:
            json.dump(raw_responses, f, indent=2, ensure_ascii=False)

    # Save translations.
    translations_path = config.STORAGE_PATH / "mods" / req.mod_id / "translations.json"
    translations_path.parent.mkdir(parents=True, exist_ok=True)

    existing = {}
    if translations_path.exists():
        with open(translations_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    existing.update(all_translations)

    with open(translations_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    # Update progress.
    tracker = ProgressTracker()
    tracker.mark_translated(req.mod_id, list(all_translations.keys()))

    # Save TM.
    tm.save()

    # Filter out suggestions where the source term only appears in keys, not in
    # the actual source text or English translations.
    all_source_texts = set()
    all_english_texts = set()
    for key, loc_str in strings.items():
        for lang_name, text in loc_str.translations.items():
            if lang_name == "English":
                all_english_texts.add(text.lower())
            else:
                all_source_texts.add(text.lower())
    filtered_suggestions = []
    for suggestion in all_suggestions:
        source_term = suggestion.get("source", "").lower()
        english_term = suggestion.get("english", "").lower()
        if not source_term and not english_term:
            continue
        # Check if the source term appears in any source text
        source_found = any(source_term in text for text in all_source_texts) if source_term else False
        # Check if the english term appears in any english text
        english_found = any(english_term in text for text in all_english_texts) if english_term else False
        if source_found or english_found:
            filtered_suggestions.append(suggestion)

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

    # Hash translations.json content.
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    if translations_path.exists():
        h.update(translations_path.read_bytes())

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
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    if not translations_path.exists():
        return {"has_changes": False}

    try:
        with open(translations_path, "r", encoding="utf-8") as f:
            translations = json.load(f)
    except Exception:
        return {"has_changes": False}

    if not translations:
        return {"has_changes": False}

    # Compare current snapshot against last export.
    current_hash = _compute_export_snapshot(mod_id, mod_path)
    last_hash = _load_last_export_hash(mod_id)

    return {"has_changes": current_hash != last_hash}


@app.post("/api/mods/{mod_id}/export")
async def export_mod(mod_id: str):
    """Write saved translations back into the mod's original CSV files.

    Applies all stored English translations to the mod's localization CSVs,
    removes any duplicate variant files, and records an export snapshot so
    subsequent `get_export_status` calls can detect new changes.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `status`, the number of `applied` translations,
        `files_written` (list of CSV filenames updated), and
        `files_removed` (list of variant file paths deleted).

    Raises:
        HTTPException: 400 if no translations exist for the mod.
        HTTPException: 404 if the mod is not found.
    """
    mod_path = _find_mod_path(mod_id)

    # Save a backup of the original CSV files before the first export so
    # "Reset" can restore them later.
    original_csv_dir = config.STORAGE_PATH / "mods" / mod_id / "original_csvs"
    if not original_csv_dir.exists():
        original_csv_dir.mkdir(parents=True, exist_ok=True)
        for csv_path in _get_mod_csv_paths(mod_path):
            # Preserve relative path structure (Localization/file.csv vs file.csv)
            rel = csv_path.relative_to(mod_path)
            dest = original_csv_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(csv_path, dest)

    # Load saved translations.
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    if not translations_path.exists():
        raise HTTPException(status_code=400, detail="No translations found for this mod")

    with open(translations_path, "r", encoding="utf-8") as f:
        translations = json.load(f)

    if not translations:
        raise HTTPException(status_code=400, detail="No translations to export")

    # Extract current strings from the mod.
    strings, variant_files = _adapter.extract_strings(mod_path)

    # Apply translations to the English column.
    applied = 0
    for key, english in translations.items():
        if key in strings:
            strings[key].translations["English"] = english
            applied += 1

    # Group strings by source file and write back to original locations.
    by_source: dict[str, list] = {}
    for key, loc_str in strings.items():
        source = loc_str.source_file or "LangDataDB.csv"
        if source not in by_source:
            by_source[source] = []
        by_source[source].append(loc_str)

    files_written = []
    for csv_filename, entries in by_source.items():
        # DLL-extracted strings have the DLL name as source_file.
        # Remap to a standard CSV so we create a proper localization file.
        if csv_filename.lower().endswith(".dll"):
            csv_filename = "LangDataDB.csv"

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

    return {
        "status": "success",
        "applied": applied,
        "files_written": files_written,
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
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    if not translations_path.exists():
        return {"affected": []}

    with open(translations_path, "r", encoding="utf-8") as f:
        translations = json.load(f)

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
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    if not translations_path.exists():
        return {"status": "success", "replaced": 0}

    with open(translations_path, "r", encoding="utf-8") as f:
        translations = json.load(f)

    # Back up before applying replacements.
    create_backup(mod_id, f"Before replacing '{req.old_english}' with '{req.new_english}'")

    replaced = 0
    for key in translations:
        if req.old_english in translations[key]:
            new_text = translations[key].replace(req.old_english, req.new_english)
            if new_text != translations[key]:
                translations[key] = new_text
                replaced += 1

    with open(translations_path, "w", encoding="utf-8") as f:
        json.dump(translations, f, indent=2, ensure_ascii=False)

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
    uvicorn.run(app, host="0.0.0.0", port=8000)
