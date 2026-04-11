"""Shared state and helper functions used across route modules.

Centralises module-level singletons (game adapter, cancel-event dicts,
env-file path) and pure-logic helpers that multiple routers depend on.
"""

import asyncio
import hashlib
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from backend import config
from backend.games.registry import get_adapter
from backend.games.base import GameAdapter
from backend.data.progress_tracker import ProgressTracker
from backend.data.translation_store import load_translations

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_adapter: GameAdapter = get_adapter(config.ACTIVE_GAME)
"""The active game adapter singleton."""

_active_translations: dict[str, threading.Event] = {}
"""Active translation cancel events, keyed by mod_id."""

_gguf_download_cancels: dict[str, asyncio.Event] = {}
"""Active GGUF download cancel events, keyed by filename."""

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
"""Path to the backend `.env` configuration file."""

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _stamp_raw_responses(responses: list[dict]) -> list[dict]:
    """Add an ISO-8601 UTC timestamp to each raw API response dict.

    Args:
        responses: List of response dicts from the translation provider.

    Returns:
        The same list, modified in-place with a `timestamp` key added to
        each dict.
    """
    now = datetime.now(timezone.utc).isoformat()
    for r in responses:
        r["timestamp"] = now
    return responses


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


def _find_mod(mod_id: str):
    """Find a mod by ID, returning the full ModInfo object.

    Args:
        mod_id: The workshop identifier of the mod.

    Returns:
        The `ModInfo` object for the matching mod.

    Raises:
        HTTPException: 404 if no mod with the given id is found.
    """
    mods = _adapter.scan_mods()
    matching = [m for m in mods if m.mod_id == mod_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Mod not found")
    return matching[0]


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


def _compute_export_snapshot(mod_id: str, mod_path: Path) -> str:
    """Compute a SHA-256 hash of the current translations and mod CSVs.

    Combines the `translations.json` content with the mod's CSV file contents
    so we can detect changes on either side (new translations or mod author
    updates). Excludes timestamps so metadata-only changes don't trigger a
    false "needs export" signal.

    Args:
        mod_id: The mod's Workshop ID.
        mod_path: Filesystem path to the mod's root directory.

    Returns:
        Hex-digest hash string representing the current state.
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


def _compute_csv_snapshot(mod_path: Path) -> str:
    """Compute a SHA-256 hash of only the mod's CSV files.

    Unlike `_compute_export_snapshot`, this excludes translations so it
    can detect mod-author CSV updates without being affected by new
    user translations.

    Args:
        mod_path: Filesystem path to the mod's root directory.

    Returns:
        Hex-digest hash string representing the current CSV state.
    """
    h = hashlib.sha256()
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


def _mask_key(key: str) -> str:
    """Return a masked version of an API key for safe display.

    Args:
        key: The raw API key string.

    Returns:
        A string like `"••••ab12"` showing only the last 4 characters,
        or an empty string if the key is not set.
    """
    if not key or not key.strip():
        return ""
    return "••••" + key[-4:]
