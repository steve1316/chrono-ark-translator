"""
FastAPI backend for Chrono Ark Mod Translation Dashboard.

Provides REST APIs for mod discovery, string extraction, translation status,
glossary management, and triggering translation jobs.
"""

import hashlib
import os
import sys
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
from games.registry import get_adapter
from games.base import GameAdapter
from data.progress_tracker import ProgressTracker
from data.glossary_manager import (
    load_glossary, save_glossary, add_glossary_term, get_glossary_prompt,
    load_mod_glossary, save_mod_glossary, merge_glossaries,
)
from data.translation_memory import TranslationMemory
from data.suggestion_manager import (
    load_suggestions, add_suggestions, remove_suggestions, clear_suggestions,
)
from main import _get_provider, _save_extracted_strings

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
    source: str
    english: str

class ModGlossaryTerm(BaseModel):
    english: str
    source_mappings: dict[str, str] = {}
    category: str = "custom"

class SuggestionAction(BaseModel):
    terms: list[str] = []
    all: bool = False

class TranslationRequest(BaseModel):
    mod_id: str
    provider: Optional[str] = None
    dry_run: bool = False

class TranslationUpdate(BaseModel):
    key: str
    english: str

# --- API Endpoints ---

@app.get("/api/game")
async def get_game_info():
    """Return metadata about the active game adapter."""
    return {
        "game_id": _adapter.game_id,
        "game_name": _adapter.game_name,
    }

@app.get("/api/mods")
async def get_mods():
    """List all workshop mods with their current status."""
    mods = _adapter.scan_mods()
    tracker = ProgressTracker()

    results = []
    for mod in mods:
        status = tracker.get_status(mod.mod_id)
        preview_img = _find_mod_preview_image(mod.path)
        results.append({
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
        })
    return results

@app.get("/api/mods/{mod_id}")
async def get_mod_detail(mod_id: str):
    """Get detailed string data for a specific mod."""
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

        if english:
            translated_keys.append(key)

        results.append({
            "key": key,
            "type": loc_str.type,
            "desc": loc_str.desc,
            "source": source_text,
            "source_lang": source_lang,
            "english": english,
            "is_translated": bool(english)
        })

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
    """Save a manual translation for a specific key."""
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
    if update.english:
        tracker.mark_translated(mod_id, [update.key])
    else:
        tracker.unmark_translated(mod_id, [update.key])

    return {"status": "success"}

@app.post("/api/mods/{mod_id}/sync")
async def sync_mod(mod_id: str):
    """Re-scan and extract strings for a mod."""
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings, _ = _adapter.extract_strings(mod_path)
    output_path = config.STORAGE_PATH / "mods" / mod_id / "source.json"
    _save_extracted_strings(strings, output_path)

    tracker = ProgressTracker()
    diff = tracker.update(mod_id, strings, _adapter.source_languages)

    return {
        "status": "success",
        "new": len(diff.new_keys),
        "modified": len(diff.modified_keys),
        "removed": len(diff.removed_keys),
        "unchanged": len(diff.unchanged_keys)
    }

@app.post("/api/mods/{mod_id}/clear")
async def clear_mod_cache(mod_id: str):
    """Delete all extracted strings, translations, and progress for a mod."""
    mod_storage = config.STORAGE_PATH / "mods" / mod_id
    if not mod_storage.exists():
        return {"status": "success", "message": "No data to clear"}

    import shutil
    try:
        shutil.rmtree(mod_storage)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@app.post("/api/translate/estimate")
async def estimate_translation(req: TranslationRequest):
    """Estimate cost and time for translating a mod."""
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
    provider = _get_provider(provider_name)

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
        )

    return {
        "total_strings": len(untranslated),
        "provider": provider.name,
        "estimates": estimates
    }


@app.post("/api/translate/preview")
async def preview_translation(req: TranslationRequest):
    """Preview the translation prompt that will be sent to the provider."""
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
    provider = _get_provider(provider_name)

    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    merged = merge_glossaries(base_glossary, mod_glossary)
    game_context = _adapter.get_translation_context()
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
    total_batches = 0
    for lang, entries in by_lang.items():
        glossary_prompt = get_glossary_prompt(merged, source_lang=lang)
        num_batches = (len(entries) + batch_size - 1) // batch_size
        total_batches += num_batches
        first_batch = entries[:batch_size]
        system_prompt, user_message = provider.build_prompt(
            first_batch, lang, glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
        )
        previews[lang] = {
            "system_prompt": system_prompt,
            "user_message": user_message,
            "strings_in_language": len(entries),
            "batches": num_batches,
        }

    return {
        "total_strings": len(untranslated),
        "total_batches": total_batches,
        "batch_size": batch_size,
        "provider": provider.name,
        "previews": previews,
    }


@app.post("/api/translate")
async def translate_mod(req: TranslationRequest):
    """Trigger translation for a mod."""
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
    provider = _get_provider(provider_name)

    if not untranslated:
        if req.dry_run:
            return {"total_strings": 0, "provider": provider.name, "estimates": {}}
        return {"status": "complete", "message": "All strings already translated", "translated": 0, "suggestions": 0}

    # Load merged glossary.
    base_glossary = load_glossary()
    mod_glossary = load_mod_glossary(req.mod_id)
    merged = merge_glossaries(base_glossary, mod_glossary)
    game_context = _adapter.get_translation_context()
    format_rules = _adapter.get_format_preservation_rules()
    style_examples = _adapter.get_style_examples()

    if req.dry_run:
        by_lang: dict[str, list] = {}
        for key, loc_str in untranslated.items():
            lang = _adapter.detect_source_language(loc_str)
            if lang:
                if lang not in by_lang:
                    by_lang[lang] = []
                by_lang[lang].append((key, loc_str.translations.get(lang, "")))
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
            )
        return {"total_strings": len(untranslated), "provider": provider.name, "estimates": estimates}

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

    batch_size = config.BATCH_SIZE
    try:
        for lang, entries in by_lang.items():
            glossary_prompt = get_glossary_prompt(merged, source_lang=lang)
            for i in range(0, len(entries), batch_size):
                batch = entries[i : i + batch_size]
                translations, suggestions = provider.translate_batch(
                    batch, lang, glossary_prompt,
                    game_context=game_context,
                    format_rules=format_rules,
                    style_examples=style_examples,
                )
                all_translations.update(translations)
                all_suggestions.extend(suggestions)

                for key, english in translations.items():
                    source_text = next((t for k, t in batch if k == key), "")
                    if source_text and english:
                        tm.store(source_text, english, lang)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

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

    # Store suggestions.
    if all_suggestions:
        add_suggestions(req.mod_id, all_suggestions)

    return {
        "status": "success",
        "translated": len(all_translations),
        "suggestions": len(all_suggestions),
    }


def _get_mod_csv_paths(mod_path: Path) -> list[Path]:
    """Collect all CSV file paths for a mod (Localization/ and top-level Lang*)."""
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
    """Load the snapshot hash saved after the last successful export."""
    path = config.STORAGE_PATH / "mods" / mod_id / "last_export.json"
    if not path.exists():
        return ""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("hash", "")
    except Exception:
        return ""


def _save_last_export_hash(mod_id: str, snapshot_hash: str) -> None:
    """Save the snapshot hash after a successful export."""
    path = config.STORAGE_PATH / "mods" / mod_id / "last_export.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"hash": snapshot_hash}, f)


def _find_mod_path(mod_id: str) -> Path:
    """Find the mod directory path by scanning, or raise 404."""
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    return matching[0].path


@app.get("/api/mods/{mod_id}/export-status")
async def get_export_status(mod_id: str):
    """Check whether there are changes to sync to the mod's CSV files."""
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
    """Write saved translations back into the mod's original CSV files."""
    mod_path = _find_mod_path(mod_id)

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

    return {
        "status": "success",
        "applied": applied,
        "files_written": files_written,
        "files_removed": files_removed,
    }


def _find_mod_preview_image(mod_path: Path) -> Optional[Path]:
    """Find a preview image (.png or .jpg) in the mod's root directory."""
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for img in mod_path.glob(ext):
            return img
    return None



@app.get("/api/glossary")
async def get_glossary():
    """Get all terminology glossary entries."""
    glossary = load_glossary()
    return glossary

@app.post("/api/glossary")
async def update_glossary(term: GlossaryTerm):
    """Add or update a glossary term."""
    glossary = load_glossary()
    add_glossary_term(glossary, term.english, {"custom": term.source})
    save_glossary(glossary)
    return {"status": "success"}

@app.get("/api/mods/{mod_id}/glossary")
async def get_mod_glossary(mod_id: str):
    """Get a mod's glossary terms."""
    return load_mod_glossary(mod_id)


@app.post("/api/mods/{mod_id}/glossary")
async def update_mod_glossary(mod_id: str, term: ModGlossaryTerm):
    """Add or update a term in a mod's glossary."""
    glossary = load_mod_glossary(mod_id)
    add_glossary_term(glossary, term.english, term.source_mappings, term.category)
    save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@app.delete("/api/mods/{mod_id}/glossary/{term}")
async def delete_mod_glossary_term(mod_id: str, term: str):
    """Remove a term from a mod's glossary."""
    glossary = load_mod_glossary(mod_id)
    if term in glossary.get("terms", {}):
        del glossary["terms"][term]
        save_mod_glossary(mod_id, glossary)
    return {"status": "success"}


@app.get("/api/mods/{mod_id}/glossary/merged")
async def get_merged_glossary(mod_id: str):
    """Get the merged base + mod glossary."""
    base = load_glossary()
    mod = load_mod_glossary(mod_id)
    return merge_glossaries(base, mod)


@app.get("/api/mods/{mod_id}/glossary/suggestions")
async def get_suggestions(mod_id: str):
    """Get pending glossary term suggestions."""
    return load_suggestions(mod_id)


@app.post("/api/mods/{mod_id}/glossary/suggestions/accept")
async def accept_suggestions(mod_id: str, action: SuggestionAction):
    """Accept suggestions into the mod glossary."""
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
    """Dismiss (remove) suggestions without adding to glossary."""
    if action.all:
        clear_suggestions(mod_id)
    else:
        remove_suggestions(mod_id, action.terms)
    return {"status": "success"}


@app.get("/api/stats")
async def get_stats():
    """Get global statistics for translation memory and progress."""
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
        "total_strings": total_strings
    }

# Mount the workshop directory as static files so preview images are served
# directly without going through a Python endpoint for each request.
# This must be after all route definitions since mounts take priority over
# routes defined after them.
_workshop_path = getattr(_adapter, '_WORKSHOP_PATH', None)
if _workshop_path and Path(_workshop_path).exists():
    app.mount("/workshop", StaticFiles(directory=str(_workshop_path)), name="workshop")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
