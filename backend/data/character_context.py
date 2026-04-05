"""Load and save per-mod character context for translation prompts."""

import json
from pathlib import Path
from backend import config

_DEFAULTS = {"source_game": "", "character_name": "", "background": ""}


def load_character_context(mod_id: str, *, storage_path: Path | None = None) -> dict:
    """Return character context dict for a mod, with empty-string defaults for missing fields.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.

    Returns:
        Dictionary with keys `source_game`, `character_name`, and
        `background`, each defaulting to an empty string if absent.
    """
    base = storage_path or config.STORAGE_PATH
    path = base / "mods" / mod_id / "character_context.json"
    if not path.exists():
        return dict(_DEFAULTS)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: data.get(k, "") for k in _DEFAULTS}
    except (json.JSONDecodeError, OSError):
        return dict(_DEFAULTS)


def save_character_context(mod_id: str, ctx: dict, *, storage_path: Path | None = None) -> None:
    """Save character context dict for a mod.

    Only the keys defined in `_DEFAULTS` are persisted; extra keys in
    *ctx* are silently ignored.

    Args:
        mod_id: The mod's Workshop ID.
        ctx: Character context dictionary to save.
        storage_path: Base storage path override. Defaults to config.STORAGE_PATH.
    """
    base = storage_path or config.STORAGE_PATH
    mod_dir = base / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    path = mod_dir / "character_context.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump({k: ctx.get(k, "") for k in _DEFAULTS}, f, indent=2, ensure_ascii=False)
