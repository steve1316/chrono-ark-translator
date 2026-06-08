"""Build a WH3 translation mod's published `.pack` from its loose `.loc.tsv` files via the RPFM CLI.

Mirrors the direct-subprocess pattern in `loc_extractor.py` (schema resolved next to `rpfm_cli.exe`, `cwd` set to its
directory). Used by the `/sync` route to rebuild the pack right after the loose-file writeback.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from backend import config
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod


class PackBuildError(Exception):
    """Base class for all recoverable pack-rebuild failures (always non-fatal to the sync)."""


class RpfmNotConfiguredError(PackBuildError):
    """`rpfm_cli` could not be resolved to a file on disk."""


class PackNotFoundError(PackBuildError):
    """No `.pack` exists in the mod's workshop content directory."""


class AmbiguousPackError(PackBuildError):
    """More than one `.pack` exists in the directory, so the target is ambiguous."""


class RpfmFailedError(PackBuildError):
    """The `rpfm_cli` subprocess returned a non-zero exit code."""


def resolve_target_pack(workshop_content_dir: Path) -> Path:
    """Return the single `.pack` inside the workshop content directory.

    Args:
        workshop_content_dir: Local Steam Workshop content folder for the mod.

    Returns:
        Path to the one `.pack` file in the directory.

    Raises:
        PackNotFoundError: When the directory is missing or contains no `.pack`.
        AmbiguousPackError: When the directory contains more than one `.pack`.
    """
    if not workshop_content_dir.exists():
        raise PackNotFoundError(f"workshop content dir does not exist: {workshop_content_dir}")
    packs = sorted(workshop_content_dir.glob("*.pack"))
    if not packs:
        raise PackNotFoundError(f"no .pack found in {workshop_content_dir}")
    if len(packs) > 1:
        raise AmbiguousPackError(f"multiple .pack files in {workshop_content_dir}; cannot pick target")
    return packs[0]
