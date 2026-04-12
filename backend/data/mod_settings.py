"""Load and save per-mod settings such as source language override."""

import json
from datetime import datetime, timezone
from pathlib import Path
from backend import config


def load_source_language_override(mod_id: str, *, storage_path: Path | None = None) -> str | None:
    """Return the source language override for a mod, or None for auto-detect.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path override. Defaults to `config.STORAGE_PATH`.

    Returns:
        The override language name (e.g. `"Korean"`), or None if not set.
    """
    base = storage_path or config.STORAGE_PATH
    path = base / "mods" / mod_id / "mod_settings.json"
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("source_language_override") or None
    except (json.JSONDecodeError, OSError):
        return None


def save_source_language_override(
    mod_id: str,
    language: str | None,
    *,
    storage_path: Path | None = None,
) -> None:
    """Save the source language override for a mod.

    Args:
        mod_id: The mod's Workshop ID.
        language: Language name to use as override, or None for auto-detect.
        storage_path: Base storage path override. Defaults to `config.STORAGE_PATH`.
    """
    base = storage_path or config.STORAGE_PATH
    mod_dir = base / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    path = mod_dir / "mod_settings.json"

    # Preserve any existing settings in the file.
    existing: dict = {}
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    existing["source_language_override"] = language if language else None
    existing["updated_at"] = datetime.now(timezone.utc).isoformat()

    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
