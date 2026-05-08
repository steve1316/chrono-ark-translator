"""One-time migration: legacy flat storage -> per-game namespaced storage.

Moves `<STORAGE_PATH>/mods/...`, `<STORAGE_PATH>/glossary.json`, and
`<STORAGE_PATH>/translation_memory.json` to
`<STORAGE_PATH>/games/chrono_ark/{mods, glossary.json, translation_memory.json}`.
Idempotent: writes a marker file once complete and is a no-op when the marker
is present.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from backend import config

LOG = logging.getLogger(__name__)

_GAME_ID = "chrono_ark"
_MARKER_RELATIVE = Path("_migrations") / "v1_complete.marker"
_LEGACY_TO_NEW = [
    ("mods", "mods"),
    ("glossary.json", "glossary.json"),
    ("translation_memory.json", "translation_memory.json"),
]


def _root() -> Path:
    """Return the configured storage root."""
    return Path(config.STORAGE_PATH)


def _marker_path() -> Path:
    """Return the migration completion marker path."""
    return _root() / _MARKER_RELATIVE


def run_migration() -> bool:
    """Move legacy storage into the per-game namespace if not already done.

    Returns:
        `True` if the migration ran. `False` if the marker already exists.
    """
    marker = _marker_path()
    if marker.exists():
        LOG.info("Storage migration v1->v2 already complete; skipping.")
        return False

    root = _root()
    new_root = root / "games" / _GAME_ID
    new_root.mkdir(parents=True, exist_ok=True)

    for legacy_name, new_name in _LEGACY_TO_NEW:
        legacy = root / legacy_name
        target = new_root / new_name
        if legacy.exists() and not target.exists():
            LOG.info("Migrating %s -> %s", legacy, target)
            shutil.move(str(legacy), str(target))

    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("v1->v2 migration complete\n", encoding="utf-8")
    LOG.info("Storage migration v1->v2 complete; marker written at %s", marker)
    return True
