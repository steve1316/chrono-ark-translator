"""Shared internals for TW3 route modules."""

from __future__ import annotations

from pathlib import Path

from backend import config


def helper_scripts_path() -> Path:
    """Resolve the configured helper_scripts directory from `config.TW3_HELPER_PATH`.

    Returns:
        `Path` object. May not exist on disk; loaders validate that.
    """
    return Path(config.TW3_HELPER_PATH or "")


TW3_APPID = "1142710"


def tw3_workshop_content_dir(workshop_id: str) -> Path | None:
    """Resolve the local Steam Workshop folder for a TW3 workshop item.

    Builds `<steam_library_drive>\\SteamLibrary\\steamapps\\workshop\\content\\1142710\\<workshop_id>`
    from `config.TW3_STEAM_LIBRARY_DRIVE`. The folder may not exist on disk. Callers should validate before use.

    Args:
        workshop_id: Numeric Steam Workshop item id (the caller is responsible for sanitizing).

    Returns:
        Resolved `Path` to the workshop content directory, or `None` when the
        Steam library drive setting is empty.
    """
    drive = config.TW3_STEAM_LIBRARY_DRIVE or ""
    if not drive:
        return None
    return Path(drive) / "SteamLibrary" / "steamapps" / "workshop" / "content" / TW3_APPID / workshop_id
