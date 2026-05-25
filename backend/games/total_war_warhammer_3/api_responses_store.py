"""Append-only audit log of LLM API calls per WH3 mod.

Records translate-batch, scan-terms, and suggest-edits Claude calls. Bounded to the last 20 entries per mod; oldest is dropped when the 21st is written.
The log is stored as a JSON array (newest last on disk, but `list_entries` returns newest first for UI convenience).
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.games.storage_paths import game_storage_path

GAME_ID = "total_war_warhammer_3"
MAX_ENTRIES = 20


def _path(mod_id: str) -> Path:
    return game_storage_path(GAME_ID) / "mods" / mod_id / "api_responses.json"


def _load(mod_id: str) -> list[dict]:
    p = _path(mod_id)
    if not p.exists():
        return []
    try:
        with p.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save(mod_id: str, entries: list[dict]) -> None:
    p = _path(mod_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)


def append(mod_id: str, entry: dict) -> None:
    """Append one API response entry to the mod's log.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.
        entry: Audit entry dict (timestamp, kind, provider, model, tokens, cost, keys_or_inputs, raw_response).
    """
    entries = _load(mod_id)
    entries.append(entry)
    if len(entries) > MAX_ENTRIES:
        entries = entries[-MAX_ENTRIES:]
    _save(mod_id, entries)


def list_entries(mod_id: str) -> list[dict]:
    """List API response entries for a mod, newest first.

    Args:
        mod_id: Steam Workshop ID of the WH3 translation mod.

    Returns:
        List of audit entries; empty if no log exists.
    """
    return list(reversed(_load(mod_id)))
