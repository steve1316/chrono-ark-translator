"""
Abstract base class for game adapters.

Defines the interface that all game-specific adapters must implement
to support extraction, translation, and export workflows.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from models import LocString


@dataclass
class ModInfo:
    """Game-agnostic mod/project metadata."""
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
    """
    Abstract interface for game-specific extraction, export, and context.

    Each supported game implements this to define how to find mods,
    extract strings, export translations, build glossaries, and provide
    translation context for LLM providers.
    """

    @property
    @abstractmethod
    def game_id(self) -> str:
        """Unique identifier for this game (e.g. 'chrono_ark')."""
        ...

    @property
    @abstractmethod
    def game_name(self) -> str:
        """Human-readable game name."""
        ...

    @property
    @abstractmethod
    def target_language(self) -> str:
        """The language being translated INTO (e.g. 'English')."""
        ...

    @property
    @abstractmethod
    def source_languages(self) -> list[str]:
        """Source languages to check, in priority order."""
        ...

    @abstractmethod
    def get_translation_context(self) -> str:
        """Return a game-description string for LLM system prompts."""
        ...

    @abstractmethod
    def get_format_preservation_rules(self) -> list[str]:
        """Return game-specific formatting rules for LLM prompts."""
        ...

    @abstractmethod
    def get_style_examples(self) -> dict[str, list[tuple[str, str]]]:
        """
        Return curated source->English translation examples for few-shot prompting.

        Returns:
            Dict mapping category name to list of (source_text, english_text) pairs.
        """
        ...

    @abstractmethod
    def scan_mods(self, search_path: Optional[Path] = None) -> list[ModInfo]:
        """Discover all installed mods/projects for this game."""
        ...

    @abstractmethod
    def extract_strings(self, mod_path: Path) -> tuple[dict[str, LocString], list[str]]:
        """
        Extract all localization strings from a mod/project directory.

        Returns:
            Tuple of (strings dict, list of variant/duplicate file paths).
        """
        ...

    @abstractmethod
    def extract_base_game_strings(self, game_path: Optional[Path] = None) -> dict[str, LocString]:
        """Extract strings from the base game (for glossary building)."""
        ...

    @abstractmethod
    def detect_source_language(self, loc_string: LocString) -> Optional[str]:
        """Determine which source language column has content."""
        ...

    @abstractmethod
    def get_untranslated(self, strings: dict[str, LocString]) -> dict[str, LocString]:
        """Filter strings needing translation."""
        ...

    @abstractmethod
    def get_glossary_categories(self) -> dict[str, str]:
        """Return category_name -> key_prefix mappings for auto-glossary."""
        ...

    @abstractmethod
    def export_strings(self, output_path: Path, entries: list[LocString]) -> None:
        """Write localization entries back to the game's native format."""
        ...

    @abstractmethod
    def get_mod_url(self, mod_id: str) -> Optional[str]:
        """Return an external URL for the mod, or None."""
        ...
