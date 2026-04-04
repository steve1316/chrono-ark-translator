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
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import config
from games.registry import get_adapter
from games.base import GameAdapter
from data.progress_tracker import ProgressTracker
from data.glossary_manager import load_glossary, save_glossary, add_glossary_term
from data.translation_memory import TranslationMemory
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
        has_preview = _find_mod_preview_image(mod.path) is not None
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
            "preview_image": f"/api/mods/{mod.mod_id}/preview" if has_preview else None,
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
    strings = _adapter.extract_strings(mod_path)

    # Load existing translations if any
    translations_path = config.STORAGE_PATH / "mods" / mod_id / "translations.json"
    translations = {}
    if translations_path.exists():
        try:
            with open(translations_path, "r", encoding="utf-8") as f:
                translations = json.load(f)
        except Exception:
            pass

    # Build result list
    results = []
    for key, loc_str in strings.items():
        source_lang = _adapter.detect_source_language(loc_str)
        source_text = loc_str.translations.get(source_lang, "") if source_lang else ""
        english = loc_str.translations.get("English", "") or translations.get(key, "")

        results.append({
            "key": key,
            "type": loc_str.type,
            "desc": loc_str.desc,
            "source": source_text,
            "source_lang": source_lang,
            "english": english,
            "is_translated": bool(english)
        })

    has_preview = _find_mod_preview_image(mod_path) is not None
    return {
        "id": mod_id,
        "name": matching[0].name,
        "author": matching[0].author,
        "url": _adapter.get_mod_url(mod_id),
        "preview_image": f"/api/mods/{mod_id}/preview" if has_preview else None,
        "strings": results
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
    tracker.mark_translated(mod_id, [update.key])

    return {"status": "success"}

@app.post("/api/mods/{mod_id}/sync")
async def sync_mod(mod_id: str):
    """Re-scan and extract strings for a mod."""
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_path = matching[0].path

    strings = _adapter.extract_strings(mod_path)
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

    strings = _adapter.extract_strings(mod_path)
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

    estimates = {}
    for lang, entries in by_lang.items():
        estimates[lang] = provider.estimate_cost(entries)

    return {
        "total_strings": len(untranslated),
        "provider": provider.name,
        "estimates": estimates
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
    strings = _adapter.extract_strings(mod_path)

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

    # Save snapshot hash so export-status knows we're in sync.
    snapshot_hash = _compute_export_snapshot(mod_id, mod_path)
    _save_last_export_hash(mod_id, snapshot_hash)

    return {
        "status": "success",
        "applied": applied,
        "files_written": files_written,
    }


def _find_mod_preview_image(mod_path: Path) -> Optional[Path]:
    """Find a preview image (.png or .jpg) in the mod's root directory."""
    for ext in ("*.png", "*.jpg", "*.jpeg"):
        for img in mod_path.glob(ext):
            return img
    return None


@app.get("/api/mods/{mod_id}/preview")
async def get_mod_preview(mod_id: str):
    """Serve the mod's preview image from its workshop folder."""
    mod_path = _find_mod_path(mod_id)
    img = _find_mod_preview_image(mod_path)
    if not img:
        raise HTTPException(status_code=404, detail="No preview image found")
    return FileResponse(img, media_type=f"image/{img.suffix.lstrip('.').replace('jpg', 'jpeg')}")


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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
