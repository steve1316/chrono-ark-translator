"""
GDE (Game Data Editor) JSON extractor for Chrono Ark mods.

Parses the `gdata/Add/*.json` files that mods ship alongside their DLLs.
These files define skills, buffs, equipment, characters, etc. and contain
localizable text fields such as Name, Description, and dialogue arrays.
"""

import json
from pathlib import Path
from backend.models import LocString


# Maps (schema, field_name) to a canonical suffix used in the localization key.
# For example Skill with field "Name" → key suffix "_Name".
_FIELD_SUFFIXES: dict[str, str] = {
    "Name": "_Name",
    "name": "_Name",
    "Description": "_Desc",
    "Desc": "_Desc",
    "Des": "_Desc",
    "PassiveName": "_PassiveName",
    "PassiveDes": "_PassiveDesc",
    "SelectInfo": "_SelectInfo",
    "Flavor": "_Flavor",
}

# Schema names used as key prefixes (matches base-game CSV convention).
_SCHEMA_PREFIX: dict[str, str] = {
    "Skill": "Skill",
    "Buff": "Buff",
    "Item_Equip": "Item_Equip",
    "Item_Passive": "Item_Passive",
    "Character": "Character",
    "SkillExtended": "SkillExtended",
    "SkillKeyword": "SkillKeyword",
}

# Character fields that hold string arrays (dialogue lines).
_DIALOGUE_ARRAY_FIELDS = {
    "Text_Battle_Idle",
    "Text_Battle_ND",
    "Text_Battle_AllyND",
    "Text_Battle_Start",
    "Text_Battle_Kill",
    "Text_Battle_Cri",
    "Text_Battle_Healed",
    "Text_Field_Idle",
    "Text_PharosLeader",
    "Text_Ex",
    "Text_EquipGet",
    "Text_BangBangKaBang",
}


def _has_cjk(s: str) -> bool:
    """Check if a string contains CJK or Hangul characters.

    Args:
        s: The string to check.

    Returns:
        True if the string contains any CJK Unified Ideographs, CJK
        Extension A, Hangul Syllables, Hiragana, or Katakana characters.
    """
    for ch in s:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or 0xAC00 <= cp <= 0xD7AF or 0x3040 <= cp <= 0x309F or 0x30A0 <= cp <= 0x30FF:
            return True
    return False


def _extract_gdata_file(file_path: Path) -> dict[str, LocString]:
    """Extract localization entries from a single gdata JSON file.

    Parses the JSON structure for known schemas (Skill, Buff, Item, etc.)
    and extracts scalar text fields and dialogue string arrays that
    contain CJK text.

    Args:
        file_path: Path to the gdata JSON file.

    Returns:
        Dictionary mapping localization key to LocString. Returns an
        empty dict if the file cannot be read or contains no localizable
        entries.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  Warning: Could not read {file_path.name}: {e}")
        return {}

    results: dict[str, LocString] = {}

    for item_id, obj in data.items():
        if not isinstance(obj, dict):
            continue

        schema = obj.get("_gdeSchema", "")
        prefix = _SCHEMA_PREFIX.get(schema, schema)

        # Extract scalar text fields (Name, Description, etc.).
        for field_name, suffix in _FIELD_SUFFIXES.items():
            value = obj.get(field_name)
            if not value or not isinstance(value, str):
                continue

            loc_key = f"{prefix}/{item_id}{suffix}"
            lang = "Chinese" if _has_cjk(value) else "English"
            results[loc_key] = LocString(
                key=loc_key,
                type="Text",
                desc="",
                translations={lang: value},
                source_file=file_path.name,
            )

        # Extract dialogue string arrays (Text_Battle_Idle, etc.).
        for field_name in _DIALOGUE_ARRAY_FIELDS:
            arr = obj.get(field_name)
            if not arr:
                continue

            if isinstance(arr, list):
                for idx, line in enumerate(arr):
                    if not isinstance(line, str) or not line.strip():
                        continue
                    line = line.strip()
                    if not line:
                        continue
                    loc_key = f"{field_name}_{idx}"
                    lang = "Chinese" if _has_cjk(line) else "English"
                    results[loc_key] = LocString(
                        key=loc_key,
                        type="Text",
                        desc="",
                        translations={lang: line},
                        source_file=file_path.name,
                    )
            elif isinstance(arr, str) and arr.strip():
                # Some dialogue fields might be a single string.
                loc_key = field_name
                text = arr.strip()
                lang = "Chinese" if _has_cjk(text) else "English"
                results[loc_key] = LocString(
                    key=loc_key,
                    type="Text",
                    desc="",
                    translations={lang: text},
                    source_file=file_path.name,
                )

    return results


def export_gdata_translations(
    mod_path: Path,
    translations: dict[str, str],
) -> list[str]:
    """Write English translations back into a mod's gdata JSON files.

    Iterates over each JSON object in ``gdata/Add/*.json``, mirrors the
    extraction key logic, and overwrites the source-language field with
    the English translation when one exists.

    Args:
        mod_path: Root directory of the mod.
        translations: Mapping of localization key to English text.

    Returns:
        List of JSON filenames that were modified.
    """
    gdata_dir = mod_path / "gdata" / "Add"
    if not gdata_dir.exists():
        return []

    json_files = sorted(gdata_dir.glob("*.json"))
    if not json_files:
        return []

    files_modified: list[str] = []

    for json_file in json_files:
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        modified = False

        for item_id, obj in data.items():
            if not isinstance(obj, dict):
                continue

            schema = obj.get("_gdeSchema", "")
            prefix = _SCHEMA_PREFIX.get(schema, schema)

            # Update scalar text fields.
            for field_name, suffix in _FIELD_SUFFIXES.items():
                if field_name not in obj:
                    continue
                loc_key = f"{prefix}/{item_id}{suffix}"
                if loc_key in translations:
                    obj[field_name] = translations[loc_key]
                    modified = True

            # Update dialogue string arrays.
            for field_name in _DIALOGUE_ARRAY_FIELDS:
                arr = obj.get(field_name)
                if not arr:
                    continue

                if isinstance(arr, list):
                    for idx in range(len(arr)):
                        loc_key = f"{field_name}_{idx}"
                        if loc_key in translations:
                            arr[idx] = translations[loc_key]
                            modified = True
                elif isinstance(arr, str):
                    loc_key = field_name
                    if loc_key in translations:
                        obj[field_name] = translations[loc_key]
                        modified = True

        if modified:
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            files_modified.append(json_file.name)

    return files_modified


def extract_mod_gdata_strings(mod_path: Path) -> dict[str, LocString]:
    """
    Extract all localization strings from a mod's `gdata/Add/` directory.

    Args:
        mod_path: Root directory of the mod.

    Returns:
        Dictionary mapping localization key to LocString.
    """
    gdata_dir = mod_path / "gdata" / "Add"
    if not gdata_dir.exists():
        return {}

    all_strings: dict[str, LocString] = {}

    json_files = sorted(gdata_dir.glob("*.json"))
    if not json_files:
        return {}

    for json_file in json_files:
        entries = _extract_gdata_file(json_file)
        all_strings.update(entries)

    if all_strings:
        print(f"  Extracted {len(all_strings)} entries from {len(json_files)} gdata files")

    return all_strings
