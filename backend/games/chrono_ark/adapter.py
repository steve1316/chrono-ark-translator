"""
Chrono Ark game adapter implementation.

Handles extraction from Chrono Ark's CSV localization files,
.NET DLL string extraction, and Steam Workshop mod discovery.
"""

import csv
import os
from pathlib import Path
from typing import Optional
from backend.models import LocString
from backend.games.base import GameAdapter, ModInfo
from backend.games.chrono_ark import csv_extractor, dll_extractor, gdata_extractor, mod_scanner


class ChronoArkAdapter(GameAdapter):
    """Game adapter for Chrono Ark.

    Handles extraction from Chrono Ark's CSV localization files,
    .NET DLL string extraction, GDE JSON data files, and Steam
    Workshop mod discovery.

    Attributes:
        _BASE_GAME_PATH: Default path to the base game's StreamingAssets
            directory. Overridable via the `CATL_BASE_GAME_PATH` env var.
        _WORKSHOP_PATH: Default path to the Steam Workshop content directory.
            Overridable via the `CATL_WORKSHOP_PATH` env var.
        _CSV_FILES: Canonical CSV filenames for Chrono Ark localization.
        _CSV_COLUMNS: Ordered column names for the localization CSV format.
        _SOURCE_LANGUAGES: Source languages to check, in priority order.
        _SKIP_DLLS: Set of known dependency DLL filenames to skip during
            extraction.
        _DLL_MIN_STRING_LENGTH: Minimum string length to keep when filtering
            DLL-extracted strings.
        _METADATA_FILENAME: Name of the mod metadata JSON file.
        _GLOSSARY_CATEGORIES: Mapping of glossary category names to their
            localization key prefixes.
    """

    # Game-specific constants (moved from config.py).
    _BASE_GAME_PATH = Path(os.environ.get("CATL_BASE_GAME_PATH", r"F:\SteamLibrary\steamapps\common\Chrono Ark\ChronoArk_Data\StreamingAssets"))
    _WORKSHOP_PATH = Path(os.environ.get("CATL_WORKSHOP_PATH", r"F:\SteamLibrary\steamapps\workshop\content\1188930"))
    _CSV_FILES = [
        "LangDataDB.csv",
        "LangDialogueDB.csv",
        "LangRecordsDB.csv",
        "LangSystemDB.csv",
    ]
    # Key prefixes → CSV file mapping based on base game conventions.
    # Everything not listed here defaults to LangDataDB.csv.
    _KEY_PREFIX_TO_CSV: dict[str, str] = {
        "Dialogue": "LangDialogueDB.csv",
        "Record": "LangRecordsDB.csv",
        "Battle": "LangSystemDB.csv",
        "CharText": "LangSystemDB.csv",
        "Chartext": "LangSystemDB.csv",
        "Font": "LangSystemDB.csv",
        "Name": "LangSystemDB.csv",
        "Story": "LangSystemDB.csv",
        "StoryGlitch": "LangSystemDB.csv",
        "StoryNames": "LangSystemDB.csv",
        "System": "LangSystemDB.csv",
        "UI": "LangSystemDB.csv",
    }
    _CSV_COLUMNS = [
        "Key",
        "Type",
        "Desc",
        "Korean",
        "English",
        "Japanese",
        "Chinese",
        "Chinese-TW [zh-tw]",
    ]
    _SOURCE_LANGUAGES = ["Chinese", "Korean", "Japanese", "Chinese-TW [zh-tw]"]
    _SKIP_DLLS = {
        "0Harmony.dll",
        "Mono.Cecil.dll",
        "Mono.Cecil.Mdb.dll",
        "Mono.Cecil.Pdb.dll",
        "Mono.Cecil.Rocks.dll",
        "MonoMod.RuntimeDetour.dll",
        "MonoMod.Utils.dll",
    }
    _DLL_MIN_STRING_LENGTH = 4
    _METADATA_FILENAME = "ChronoArkMod.json"
    _GLOSSARY_CATEGORIES = {
        "characters": "Character/",
        "buffs": "Buff/",
        "skills": "Skill/",
        "items": "Item_Equip/",
        "passives": "Item_Passive/",
    }

    @staticmethod
    def csv_for_key(key: str) -> str:
        """Return the canonical CSV filename for a localization key based on its prefix."""
        prefix = key.split("/", 1)[0] if "/" in key else ""
        csv = ChronoArkAdapter._KEY_PREFIX_TO_CSV.get(prefix)
        if csv:
            return csv
        # Keys with a known LangDataDB prefix go there; everything else
        # (custom mod keys without a slash, unknown prefixes) → LangSystemDB.
        _DATA_PREFIXES = {
            "ArkUpgrade",
            "Buff",
            "Character",
            "Character_Skin",
            "CurseList",
            "EnchantList",
            "Enemy",
            "Item_Active",
            "Item_Consume",
            "Item_Equip",
            "Item_Friendship",
            "Item_Misc",
            "Item_Passive",
            "Item_Potions",
            "Item_Scroll",
            "RandomEvent",
            "SimpleCampDialogue",
            "Skill",
            "SkillExtended",
            "SkillKeyword",
            "SpecialKey",
            "SpecialRule",
            "UnlockWindow",
        }
        if prefix in _DATA_PREFIXES:
            return "LangDataDB.csv"
        return "LangSystemDB.csv"

    @property
    def game_id(self) -> str:
        return "chrono_ark"

    @property
    def game_name(self) -> str:
        return "Chrono Ark"

    @property
    def target_language(self) -> str:
        return "English"

    @property
    def source_languages(self) -> list[str]:
        return self._SOURCE_LANGUAGES

    def get_translation_context(self) -> str:
        return '"Chrono Ark", a roguelike deck-building RPG'

    def get_format_preservation_rules(self) -> list[str]:
        return [
            'Preserve ALL formatting tags exactly as-is: `<b>`, `</b>`, `<color=#XXXXXX>`, `</color>`, `<sprite=N>`, `<sprite name="...">`. Do NOT translate or modify these tags.',
            "Preserve ALL placeholder variables exactly as-is: `&a`, `&b`, `&c`, `%`. These are runtime value substitutions.",
            "Match the tone and style of the base game: The game uses a fantasy/adventure tone with concise, punchy skill descriptions. Character dialogue is conversational.",
            "Use consistent terminology: Always use the exact English terms from the glossary below. Do NOT paraphrase or use synonyms for glossary terms.",
            "Keep translations concise: Skill and buff descriptions should be brief and clear. Avoid overly formal or wordy translations.",
            "Preserve line breaks: Source text uses literal `\\n` to represent line breaks. Keep every `\\n` in the translated output in the same positions. Do NOT remove or merge lines.",
            "End sentences with periods: Even if the original source text does not end sentences with punctuation, always add a period at the end of each English sentence or description line. Exception: single-word names or titles should NOT have periods.",
        ]

    def get_style_examples(self) -> dict[str, list[tuple[str, str]]]:
        return {
            "skills": [
                ("적 전체에게 &a의 피해를 줍니다. 약화 1을 부여합니다.", "Deal &a damage to all enemies. Apply 1 Weakening."),
                ("아군 한명의 HP를 &a만큼 회복합니다.", "Restore &a HP to an ally."),
                ("적 하나에게 &a의 피해를 줍니다. 이 스킬은 방어력을 무시합니다.", "Deal &a damage to an enemy. This skill ignores Defense."),
            ],
            "buffs": [
                ("다음 공격에 의한 받는 피해가 30% 증가합니다.", "Damage taken from the next attack is increased by 30%."),
                ("매 턴 시작 시 HP를 &a만큼 회복합니다.", "Restore &a HP at the start of each turn."),
                ("공격력이 &a만큼 증가합니다.", "Attack is increased by &a."),
            ],
            "items": [
                ("공격 시 100%를 초과하는 명중률은 치명타 확률로 변환됩니다.", "When attacking, any Accuracy exceeding 100% is converted into Critical Chance."),
                ("전투 시작 시 모든 아군의 방어력이 &a 증가합니다.", "At the start of battle, all allies gain &a Defense."),
            ],
        }

    def scan_mods(self, search_path: Optional[Path] = None) -> list[ModInfo]:
        """Discover all installed Chrono Ark workshop mods.

        Scans the Steam Workshop directory for mod folders containing
        `ChronoArkMod.json` metadata files.

        Args:
            search_path: Optional override for the workshop directory.
                Defaults to `_WORKSHOP_PATH`.

        Returns:
            List of ModInfo objects for each discovered mod, sorted by
            mod_id.
        """
        workshop_path = search_path or self._WORKSHOP_PATH
        return mod_scanner.scan_workshop(
            workshop_path=workshop_path,
            metadata_filename=self._METADATA_FILENAME,
            skip_dlls=self._SKIP_DLLS,
        )

    def extract_strings(self, mod_path: Path) -> tuple[dict[str, LocString], list[str]]:
        """Extract all localization strings from a Chrono Ark mod.

        Attempts CSV extraction first. If no CSV localization files are
        found, falls back to GDE JSON (`gdata/Add/`) and DLL IL-level
        extraction.

        Args:
            mod_path: Path to the mod's root directory.

        Returns:
            Tuple of (strings dict mapping localization key to LocString,
            list of variant/duplicate file relative paths). The variant
            list is empty when falling back to non-CSV extraction.
        """
        strings, variants = csv_extractor.extract_mod_strings(mod_path)

        # Always try gdata JSON and DLL extraction, merging any entries
        # that aren't already covered by the CSVs.
        gdata_strings = gdata_extractor.extract_mod_gdata_strings(mod_path)
        for key, loc_str in gdata_strings.items():
            if key not in strings:
                strings[key] = loc_str

        dll_strings = dll_extractor.extract_mod_dll_loc_strings(
            mod_path,
            self._SKIP_DLLS,
        )
        for key, loc_str in dll_strings.items():
            if key not in strings:
                strings[key] = loc_str

        return strings, variants

    def extract_base_game_strings(self, game_path: Optional[Path] = None) -> dict[str, LocString]:
        """Extract localization strings from the base Chrono Ark game.

        Parses the canonical `Lang*.csv` files from the game's
        StreamingAssets directory for use in glossary building.

        Args:
            game_path: Optional override for the StreamingAssets directory.
                Defaults to `_BASE_GAME_PATH`.

        Returns:
            Dictionary mapping localization key to LocString.
        """
        path = game_path or self._BASE_GAME_PATH
        return csv_extractor.extract_base_game_strings(path, self._CSV_FILES)

    def detect_source_language(self, loc_string: LocString) -> Optional[str]:
        """Determine which source language column has content.

        Checks Chinese, Korean, Japanese, and Chinese-TW in priority order.

        Args:
            loc_string: The localization string to inspect.

        Returns:
            Name of the first source language with non-empty text, or None.
        """
        return csv_extractor.detect_source_language(loc_string, self._SOURCE_LANGUAGES)

    def get_untranslated(self, strings: dict[str, LocString]) -> dict[str, LocString]:
        """Filter strings that need English translation.

        Returns entries where the English column is empty but at least one
        source language column has content.

        Args:
            strings: Dictionary of all localization strings to filter.

        Returns:
            Dictionary containing only the strings needing translation.
        """
        return csv_extractor.get_untranslated_strings(strings, self._SOURCE_LANGUAGES)

    def get_glossary_categories(self) -> dict[str, str]:
        """Return Chrono Ark glossary category-to-key-prefix mappings.

        Returns:
            Dictionary mapping category names (e.g. `"characters"`,
            `"skills"`) to their localization key prefixes
            (e.g. `"Character/"`, `"Skill/"`).
        """
        return self._GLOSSARY_CATEGORIES

    def export_strings(self, output_path: Path, entries: list[LocString]) -> None:
        """Write localization entries to a Chrono Ark CSV file.

        Outputs a CSV with the standard column order: Key, Type, Desc,
        followed by each language column.

        Args:
            output_path: Destination file path for the CSV.
            entries: List of LocString objects to write.
        """
        columns = self._CSV_COLUMNS
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(columns)
            for entry in entries:
                row = [entry.key, entry.type, entry.desc]
                for lang in columns[3:]:
                    row.append(entry.translations.get(lang, ""))
                writer.writerow(row)

    def export_gdata_strings(self, mod_path: Path, translations: dict[str, str]) -> list[str]:
        """Write translations back into a mod's gdata JSON files.

        Args:
            mod_path: Root directory of the mod.
            translations: Mapping of localization key to English text.

        Returns:
            List of JSON filenames that were modified.
        """
        return gdata_extractor.export_gdata_translations(mod_path, translations)

    def get_mod_url(self, mod_id: str) -> Optional[str]:
        """Return the Steam Workshop URL for a Chrono Ark mod.

        Args:
            mod_id: Steam Workshop item ID.

        Returns:
            Steam Workshop file details URL for the given mod.
        """
        return f"https://steamcommunity.com/sharedfiles/filedetails/?id={mod_id}"
