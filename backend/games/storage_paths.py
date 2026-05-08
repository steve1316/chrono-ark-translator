"""Per-game storage path resolution.

During Phase B Task 4 this module is a compatibility shim: it returns the
legacy `STORAGE_PATH` so existing data layer modules can adopt the helper
without changing on-disk paths. Task 5 flips this to the new
`STORAGE_PATH / "games" / <game_id>` layout once the migration script has
moved the data.
"""

from __future__ import annotations

from pathlib import Path

from backend import config


def game_storage_path(game_id: str) -> Path:
    """Return the storage directory for `game_id`.

    Args:
        game_id: Adapter id (e.g. `"chrono_ark"`).

    Returns:
        Filesystem path the data layer should treat as the per-game root.

    Raises:
        ValueError: If `game_id` is empty.
    """
    if not game_id:
        raise ValueError("game_id must not be empty")
    return Path(config.STORAGE_PATH)


def mods_path(game_id: str) -> Path:
    """Return `<game_storage_path>/mods` for `game_id`."""
    return game_storage_path(game_id) / "mods"


def glossary_path(game_id: str) -> Path:
    """Return `<game_storage_path>/glossary.json` for `game_id`."""
    return game_storage_path(game_id) / "glossary.json"
