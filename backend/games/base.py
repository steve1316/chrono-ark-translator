"""
Abstract base class for game adapters.

Defines the chassis interface that all game-specific adapters must implement.
Translation, pack assembly, and other domain operations are added via
capability mixins from `backend.games.capabilities`.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import APIRouter


@dataclass
class ModInfo:
    """Game-agnostic mod/project metadata.

    Attributes:
        mod_id: Unique identifier for the mod (e.g. Steam Workshop ID).
        name: Human-readable mod name.
        author: Mod author or uploader name.
        has_loc_files: Whether the mod contains localization CSV files.
        has_dll: Whether the mod contains .NET DLL assemblies.
        loc_file_paths: Paths to discovered localization CSV files.
        dll_paths: Paths to discovered mod DLL files.
        entry_count: Total number of localization entries found.
        target_lang_populated: Whether any entries already have target language text.
        path: Filesystem path to the mod's root directory.
    """

    mod_id: str
    name: str = ""
    author: str = ""
    has_loc_files: bool = False
    has_dll: bool = False
    loc_file_paths: list[Path] = field(default_factory=list)
    dll_paths: list[Path] = field(default_factory=list)
    entry_count: int = 0
    target_lang_populated: bool = False
    path: Path = field(default_factory=lambda: Path("."))


class GameAdapter(ABC):
    """Base interface for game adapters in the workbench chassis.

    Concrete adapters declare identity, icon, capabilities, an `APIRouter`
    that owns the adapter's HTTP routes, and a settings schema. Translation,
    pack assembly, and other domain operations are added via capability
    mixins from `backend.games.capabilities` (e.g. `TranslationCapability`).
    """

    @property
    @abstractmethod
    def game_id(self) -> str:
        """Return the unique adapter id (e.g. `"chrono_ark"`)."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Return the human-readable game name shown in the UI."""

    @property
    @abstractmethod
    def icon(self) -> str:
        """Return the icon key or asset path for the game."""

    @property
    @abstractmethod
    def capabilities(self) -> list[str]:
        """Return capability tags (e.g. `["translation", "pack_assembly"]`)."""

    @property
    @abstractmethod
    def router(self) -> "APIRouter":
        """Return the FastAPI router mounted at `/api/games/<game_id>/...`."""

    @property
    def settings_schema(self) -> dict[str, dict]:
        """Return per-game settings schema. Override in adapters that need it.

        Returns:
            Mapping of setting key to `{"type": <python type name>, "default": <value>}`.
        """
        return {}

    def on_register(self) -> None:
        """Hook called once when the adapter is registered. Default: no-op."""

    @property
    def game_name(self) -> str:
        """Back-compat alias for `display_name`."""
        return self.display_name
