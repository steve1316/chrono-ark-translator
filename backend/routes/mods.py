"""Mod-related API endpoints for the Chrono Ark Translator."""

import json
import os
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend import config
from backend.routes.helpers import (
    _adapter,
    _find_mod,
    _find_mod_path,
    _find_mod_preview_image,
    _compute_export_snapshot,
    _compute_csv_snapshot,
    _load_last_export_hash,
    _save_last_export_hash,
    _merge_gdata_originals,
    _get_mod_csv_paths,
    _recalculate_mod_progress,
)
from backend.routes.models import TranslationUpdate, CharacterContext
from backend.data.translation_store import (
    load_translations,
    update_single_translation,
    clear_all_translations,
)
from backend.data.progress_tracker import ProgressTracker
from backend.data.character_context import load_character_context, save_character_context
from backend.data.history_manager import create_backup, list_backups, restore_backup, delete_backup
from backend.main import save_extracted_strings

router = APIRouter(prefix="/api")


@router.get("/mods")
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


@router.post("/mods/refresh")
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


@router.get("/mods/{mod_id}")
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
    mod = _find_mod(mod_id)
    mod_path = mod.path

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

    # If the mod's CSV files changed since the last export (mod author
    # update), the synced status is stale — clear it.  We intentionally
    # ignore translation changes here so that adding new translations
    # does not invalidate previously synced rows.
    if synced_keys:
        csv_hash_path = config.STORAGE_PATH / "mods" / mod_id / "last_csv_hash.json"
        if csv_hash_path.exists():
            try:
                with open(csv_hash_path, "r", encoding="utf-8") as f:
                    last_csv_hash = json.load(f).get("hash", "")
            except Exception:
                last_csv_hash = ""
            if _compute_csv_snapshot(mod_path) != last_csv_hash:
                synced_keys = set()
        else:
            # No CSV hash saved yet — fall back to full snapshot check.
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
        "name": mod.name,
        "author": mod.author,
        "url": _adapter.get_mod_url(mod_id),
        "preview_image": f"/workshop/{mod_id}/{preview_img.name}" if preview_img else None,
        "strings": results,
        "duplicate_files": duplicate_files,
    }


@router.post("/mods/{mod_id}/strings")
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


@router.post("/mods/{mod_id}/sync")
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
    mod_path = _find_mod_path(mod_id)

    strings, _ = _adapter.extract_strings(mod_path)
    output_path = config.STORAGE_PATH / "mods" / mod_id / "source.json"
    save_extracted_strings(strings, output_path)

    tracker = ProgressTracker()
    diff = tracker.update(mod_id, strings, _adapter.source_languages)

    return {"status": "success", "new": len(diff.new_keys), "modified": len(diff.modified_keys), "removed": len(diff.removed_keys), "unchanged": len(diff.unchanged_keys)}


@router.post("/mods/{mod_id}/clear-translations")
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
    mod_path = _find_mod_path(mod_id)

    strings, _ = _adapter.extract_strings(mod_path)

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
    for filename in ("synced_keys.json", "pre_export_english.json", "last_csv_hash.json"):
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


@router.post("/mods/{mod_id}/reset")
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
        "last_csv_hash.json",
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


@router.post("/mods/{mod_id}/open")
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


@router.get("/mods/{mod_id}/export-status")
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


@router.post("/mods/{mod_id}/export")
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

    # Save CSV-only hash so synced-key invalidation only triggers on
    # mod-author CSV changes, not on new user translations.
    csv_hash_path = config.STORAGE_PATH / "mods" / mod_id / "last_csv_hash.json"
    with open(csv_hash_path, "w", encoding="utf-8") as f:
        json.dump({"hash": _compute_csv_snapshot(mod_path)}, f)

    # Save the set of synced keys so the UI can highlight them.
    synced_keys_path = config.STORAGE_PATH / "mods" / mod_id / "synced_keys.json"
    synced_keys_path.parent.mkdir(parents=True, exist_ok=True)
    with open(synced_keys_path, "w", encoding="utf-8") as f:
        json.dump([k for k, v in translations.items() if v], f, ensure_ascii=False)

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


@router.post("/mods/{mod_id}/open-source-file/{filename}")
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


@router.post("/open-base-game-file/{filename}")
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


@router.get("/mods/{mod_id}/character-context")
async def get_character_context(mod_id: str):
    """Return saved character context for a mod.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A dict with `source_game`, `character_name`, and `background`
        fields (all strings, possibly empty).
    """
    return load_character_context(mod_id)


@router.post("/mods/{mod_id}/character-context")
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


@router.get("/mods/{mod_id}/history")
async def get_history(mod_id: str):
    """List all available backup snapshots for a mod, newest first.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        A list of backup metadata dicts with id, reason, created_at, and files.
    """
    return list_backups(mod_id)


@router.post("/mods/{mod_id}/history/{backup_id}/restore")
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


@router.delete("/mods/{mod_id}/history/{backup_id}")
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


@router.get("/mods/{mod_id}/api-responses")
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
