"""
Chrono Ark game adapter implementation.

Handles extraction from Chrono Ark's CSV localization files,
.NET DLL string extraction, and Steam Workshop mod discovery.
"""

import csv
import os
from pathlib import Path
from typing import Optional

from models import LocString
from games.base import GameAdapter, ModInfo
from games.chrono_ark import csv_extractor, dll_extractor, gdata_extractor, mod_scanner


class ChronoArkAdapter(GameAdapter):
    """Game adapter for Chrono Ark."""

    # Game-specific constants (moved from config.py).
    _BASE_GAME_PATH = Path(os.environ.get(
        "CATL_BASE_GAME_PATH",
        r"F:\SteamLibrary\steamapps\common\Chrono Ark\ChronoArk_Data\StreamingAssets"
    ))
    _WORKSHOP_PATH = Path(os.environ.get(
        "CATL_WORKSHOP_PATH",
        r"F:\SteamLibrary\steamapps\workshop\content\1188930"
    ))
    _CSV_FILES = [
        "LangDataDB.csv",
        "LangDialogueDB.csv",
        "LangRecordsDB.csv",
        "LangSystemDB.csv",
    ]
    _CSV_COLUMNS = [
        "Key", "Type", "Desc",
        "Korean", "English", "Japanese", "Chinese", "Chinese-TW [zh-tw]",
    ]
    _SOURCE_LANGUAGES = ["Chinese", "Korean", "Japanese", "Chinese-TW [zh-tw]"]
    _SKIP_DLLS = {
        "0Harmony.dll", "Mono.Cecil.dll", "Mono.Cecil.Mdb.dll",
        "Mono.Cecil.Pdb.dll", "Mono.Cecil.Rocks.dll",
        "MonoMod.RuntimeDetour.dll", "MonoMod.Utils.dll",
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
            'Preserve ALL placeholder variables exactly as-is: `&a`, `&b`, `&c`, `%`. These are runtime value substitutions.',
            'Match the tone and style of the base game: The game uses a fantasy/adventure tone with concise, punchy skill descriptions. Character dialogue is conversational.',
            'Use consistent terminology: Always use the exact English terms from the glossary below. Do NOT paraphrase or use synonyms for glossary terms.',
            'Keep translations concise: Skill and buff descriptions should be brief and clear. Avoid overly formal or wordy translations.',
            'Preserve line breaks: If the source text has line breaks (\\n), keep them in the same positions.',
        ]

    def scan_mods(self, search_path: Optional[Path] = None) -> list[ModInfo]:
        workshop_path = search_path or self._WORKSHOP_PATH
        return mod_scanner.scan_workshop(
            workshop_path=workshop_path,
            metadata_filename=self._METADATA_FILENAME,
            skip_dlls=self._SKIP_DLLS,
        )

    def extract_strings(self, mod_path: Path) -> dict[str, LocString]:
        strings = csv_extractor.extract_mod_strings(mod_path)
        if not strings:
            # No CSV localization files — try gdata JSON + DLL extraction.
            strings = gdata_extractor.extract_mod_gdata_strings(mod_path)
            dll_strings = dll_extractor.extract_mod_dll_loc_strings(
                mod_path, self._SKIP_DLLS,
            )
            # Merge DLL strings, preferring gdata entries on key collisions
            # since gdata has richer structure.
            for key, loc_str in dll_strings.items():
                if key not in strings:
                    strings[key] = loc_str
        return strings

    def extract_base_game_strings(self, game_path: Optional[Path] = None) -> dict[str, LocString]:
        path = game_path or self._BASE_GAME_PATH
        return csv_extractor.extract_base_game_strings(path, self._CSV_FILES)

    def detect_source_language(self, loc_string: LocString) -> Optional[str]:
        return csv_extractor.detect_source_language(loc_string, self._SOURCE_LANGUAGES)

    def get_untranslated(self, strings: dict[str, LocString]) -> dict[str, LocString]:
        return csv_extractor.get_untranslated_strings(strings, self._SOURCE_LANGUAGES)

    def get_glossary_categories(self) -> dict[str, str]:
        return self._GLOSSARY_CATEGORIES

    def export_strings(self, output_path: Path, entries: list[LocString]) -> None:
        columns = self._CSV_COLUMNS
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(columns)
            for entry in entries:
                row = [entry.key, entry.type, entry.desc]
                for lang in columns[3:]:
                    row.append(entry.translations.get(lang, ""))
                writer.writerow(row)

    def get_mod_url(self, mod_id: str) -> Optional[str]:
        return f"https://steamcommunity.com/sharedfiles/filedetails/?id={mod_id}"
