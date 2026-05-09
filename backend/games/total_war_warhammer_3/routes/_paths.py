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
