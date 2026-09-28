"""Changenotes for WH3 translation mods, built by diffing the strings about to ship against those shipped at the last publish.

The baseline lives in `<root>/mods/{id}/published_baseline.json`, outside `snapshots/`, so snapshot pruning never removes it. It stores a hash per
`(source file, key)` because only equality matters for the diff.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from backend.games.storage_paths import game_storage_path
from backend.games.total_war_warhammer_3.translation_drift import DriftRow, hash_text

GAME_ID = "total_war_warhammer_3"
BASELINE_FILENAME = "published_baseline.json"
GENERIC_NOTE = "[u]Translation update[/u]"


def _baseline_path(mod_id: str) -> Path:
    """Return the published baseline path for a mod.

    Args:
        mod_id: Steam Workshop ID of the translation mod.

    Returns:
        `<root>/mods/{mod_id}/published_baseline.json`.
    """
    return game_storage_path(GAME_ID) / "mods" / mod_id / BASELINE_FILENAME


def _plural(count: int, noun: str) -> str:
    """Write a count with its noun, adding an `s` unless the count is one.

    Args:
        count: How many.
        noun: Singular noun phrase, e.g. `new string`.

    Returns:
        e.g. `1 new string` or `3 new strings`.
    """
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def shipped_strings(rows: Iterable[DriftRow]) -> dict[str, dict[str, str]]:
    """Hash the translated text a publish will ship, per source file and key.

    Args:
        rows: Drift rows with `translations.json` already overlaid.

    Returns:
        `{source_filename: {key: hash}}` for every non-orphan row with non-empty translated text.
    """
    shipped: dict[str, dict[str, str]] = {}
    for row in rows:
        if row.status == "orphan" or not row.translation_text:
            continue
        shipped.setdefault(row.source_filename, {})[row.key] = hash_text(row.translation_text)
    return shipped


def load_baseline(mod_id: str) -> dict | None:
    """Read the strings recorded at the mod's last successful publish.

    Args:
        mod_id: Steam Workshop ID of the translation mod.

    Returns:
        `{"published_at", "changenote", "strings"}`, or None when the mod was never published from the app or the file is unreadable.
    """
    try:
        with _baseline_path(mod_id).open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def save_baseline(mod_id: str, strings: dict[str, dict[str, str]], changenote: str) -> None:
    """Atomically record the strings a successful publish shipped.

    Args:
        mod_id: Steam Workshop ID of the translation mod.
        strings: The shipped set captured when the upload started.
        changenote: The changenote sent with the upload.
    """
    path = _baseline_path(mod_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"published_at": datetime.now(timezone.utc).isoformat(), "changenote": changenote, "strings": strings}
    tmp = path.with_name(f"{BASELINE_FILENAME}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def diff_counts(baseline: dict[str, dict[str, str]], shipped: dict[str, dict[str, str]]) -> tuple[int, int, int]:
    """Count how the shipped set differs from the baseline, matching rows by source file and key.

    Args:
        baseline: `{source_filename: {key: hash}}` from the last publish.
        shipped: `{source_filename: {key: hash}}` about to be published.

    Returns:
        `(new, revised, removed)` row counts.
    """
    old = {(fn, key): h for fn, rows in baseline.items() for key, h in rows.items()}
    new = {(fn, key): h for fn, rows in shipped.items() for key, h in rows.items()}
    added = sum(1 for k in new if k not in old)
    revised = sum(1 for k, h in new.items() if k in old and old[k] != h)
    removed = sum(1 for k in old if k not in new)
    return added, revised, removed


def build_note(baseline: dict | None, shipped: dict[str, dict[str, str]]) -> tuple[str, bool]:
    """Build a translation mod's changenote from what changed since its last publish.

    Args:
        baseline: The mod's published baseline, or None when it has none.
        shipped: The shipped set about to be published.

    Returns:
        `(note, pending)`. Without a baseline the note is `GENERIC_NOTE` and pending. With a baseline and no differences it is `GENERIC_NOTE` and not pending.
    """
    if baseline is None:
        return GENERIC_NOTE, True
    added, revised, removed = diff_counts(baseline.get("strings") or {}, shipped)
    lines = []
    if added:
        lines.append(f"• Translated {_plural(added, 'new string')}")
    if revised:
        lines.append(f"• Revised {_plural(revised, 'translation')}")
    if removed:
        lines.append(f"• Removed {_plural(removed, 'string')} no longer in the parent mod")
    if not lines:
        return GENERIC_NOTE, False
    return GENERIC_NOTE + "\n\n" + "\n".join(lines), True
