"""
Manages pending glossary term suggestions from AI providers.

Stores suggestions per mod until the user accepts or dismisses them.
"""

import json
from pathlib import Path
from typing import Optional
from backend import config


def load_suggestions(mod_id: str, storage_path: Optional[Path] = None) -> list[dict]:
    """Load pending suggestions for a mod.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.

    Returns:
        List of suggestion dictionaries, or an empty list if none exist.
    """
    if storage_path is None:
        storage_path = config.STORAGE_PATH
    path = storage_path / "mods" / mod_id / "pending_suggestions.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_suggestions(mod_id: str, suggestions: list[dict], storage_path: Optional[Path] = None) -> None:
    """Save pending suggestions for a mod.

    Args:
        mod_id: The mod's Workshop ID.
        suggestions: List of suggestion dictionaries to persist.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.
    """
    if storage_path is None:
        storage_path = config.STORAGE_PATH
    path = storage_path / "mods" / mod_id / "pending_suggestions.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(suggestions, f, indent=2, ensure_ascii=False)


def add_suggestions(mod_id: str, new_suggestions: list[dict], storage_path: Optional[Path] = None) -> None:
    """Append new suggestions, deduplicating by english term.

    Existing suggestions with the same english term are kept (not overwritten).

    Args:
        mod_id: The mod's Workshop ID.
        new_suggestions: List of suggestion dicts to add. Each dict should
            contain at minimum an `english` key.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.
    """
    existing = load_suggestions(mod_id, storage_path)
    existing_terms = {s["english"] for s in existing if "english" in s}
    for suggestion in new_suggestions:
        if suggestion.get("english") and suggestion["english"] not in existing_terms:
            existing.append(suggestion)
            existing_terms.add(suggestion["english"])
    save_suggestions(mod_id, existing, storage_path)


def remove_suggestions(mod_id: str, terms: list[str], storage_path: Optional[Path] = None) -> None:
    """Remove specific suggestions by english term name.

    Args:
        mod_id: The mod's Workshop ID.
        terms: List of english term strings to remove.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.
    """
    existing = load_suggestions(mod_id, storage_path)
    filtered = [s for s in existing if s.get("english") not in terms]
    save_suggestions(mod_id, filtered, storage_path)


def clear_suggestions(mod_id: str, storage_path: Optional[Path] = None) -> None:
    """Remove all pending suggestions for a mod.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.
    """
    save_suggestions(mod_id, [], storage_path)
