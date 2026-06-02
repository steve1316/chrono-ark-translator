"""One-time migration: consolidate Chrono Ark's split storage.

Older route code wrote per-mod sidecars (synced_keys.json, last_csv_hash.json,
pre_export_english.json, last_api_responses.json, translation_providers.json,
source.json, last_export.json, original_csvs/, original_gdata/, export/) to the
legacy flat `<STORAGE_PATH>/mods/<mod>/...` even after v1->v2 moved the bulk data
to `<STORAGE_PATH>/games/chrono_ark/mods/`. This migration merges every legacy
file into the per-game mod dir, overwriting (legacy is the freshest copy, since
the buggy routes wrote there most recently), then removes the empty legacy `mods`
tree. Idempotent via a marker file.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from backend import config

LOG = logging.getLogger(__name__)

_GAME_ID = "chrono_ark"
_MARKER_RELATIVE = Path("_migrations") / "v2_to_v3_complete.marker"


def _root() -> Path:
    """Return the configured storage root."""
    return Path(config.STORAGE_PATH)


def _marker_path() -> Path:
    """Return the migration completion marker path."""
    return _root() / _MARKER_RELATIVE


def run_migration() -> bool:
    """Merge legacy flat sidecars into the per-game namespace if not already done.

    Returns:
        `True` if the migration ran (marker written). `False` if the marker already exists.
    """
    marker = _marker_path()
    if marker.exists():
        LOG.info("Storage migration v2->v3 already complete; skipping.")
        return False

    root = _root()
    legacy_mods = root / "mods"
    new_mods = root / "games" / _GAME_ID / "mods"

    if legacy_mods.is_dir():
        for legacy_file in legacy_mods.rglob("*"):
            if not legacy_file.is_file():
                continue
            relative = legacy_file.relative_to(legacy_mods)
            target = new_mods / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                target.unlink()
            LOG.info("Consolidating %s -> %s", legacy_file, target)
            shutil.move(str(legacy_file), str(target))
        shutil.rmtree(legacy_mods, ignore_errors=True)

    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("v2->v3 migration complete\n", encoding="utf-8")
    LOG.info("Storage migration v2->v3 complete; marker written at %s", marker)
    return True
