"""
CSV extractor for Chrono Ark localization files.

Parses the base game's Lang*.csv files and mod Localization/*.csv files
into a standardized LocString format.
"""

import csv
import re
from pathlib import Path
from typing import Optional

from models import LocString


def _is_valid_key(key: str) -> bool:
    """Check if a string looks like a valid localization key."""
    if not key or " " in key:
        return False
    # Keys typically use A-Z, a-z, 0-9, _, /, ., -
    # If it contains multi-byte characters or spaces, it's probably text.
    return bool(re.match(r"^[A-Za-z0-9_\-\./]+$", key))


def _parse_csv_content(file_path: Path) -> list[LocString]:
    """
    Parse a localization CSV with heuristic row stitching.

    Handles unquoted multiline strings by detecting rows that don't start
    with a valid key and merging their columns into the previous entry.
    """
    # regex for a valid key: starts with alphanumeric, no spaces, optional /
    key_pattern = re.compile(r'^[A-Za-z0-9_\-\./]+$')

    results = []

    try:
        f = open(file_path, "r", encoding="utf-8-sig", newline="")
        reader = csv.reader(f)
    except Exception as e:
        print(f"Error opening CSV {file_path}: {e}")
        return results

    try:
        header = next(reader)
    except StopIteration:
        return results

    header = [h.strip().rstrip("\r") for h in header]
    col_indices = {col_name: i for i, col_name in enumerate(header)}

    language_columns = ["Korean", "English", "Japanese", "Chinese", "Chinese-TW [zh-tw]"]
    active_langs = [l for l in language_columns if l in col_indices]

    last_entry: Optional[LocString] = None
    # Track which column we were last populating (for zombie rows)
    current_col_offset = 0

    for row in reader:
        if not row:
            continue

        first_cell = row[0].strip()

        # Check if this row is a continuation.
        # A continuation has a key that is invalid OR it's a short row that
        # clearly belongs to the description of the previous entry.
        is_continuation = last_entry is not None and (
            not first_cell or
            not key_pattern.match(first_cell) or
            # If it's a known key pattern but the row is too short to be a real record
            (len(row) < 3 and last_entry)
        )

        if is_continuation:
            # Shifted column logic:
            # Iterate through the columns of this zombie row and append them.
            # We start appending from the 'current_col_offset' or 3 (Korean).
            for i, val in enumerate(row):
                target_idx = current_col_offset + i

                # Find matching language for this target index
                target_lang = None
                for lang, idx in col_indices.items():
                    if idx == target_idx and lang in language_columns:
                        target_lang = lang
                        break

                if target_lang:
                    old_val = last_entry.translations.get(target_lang, "")
                    last_entry.translations[target_lang] = (old_val + "\n" + val).strip()
                elif target_idx == col_indices.get("Desc"):
                    last_entry.desc = (last_entry.desc + "\n" + val).strip()
            continue

        # New valid record
        key = first_cell
        if not key:
            continue

        entry_type = row[col_indices["Type"]].strip() if "Type" in col_indices and col_indices["Type"] < len(row) else ""
        desc = row[col_indices["Desc"]].strip() if "Desc" in col_indices and col_indices["Desc"] < len(row) else ""

        translations = {}
        # We also track the last populated column to help the stitcher
        max_idx = 0
        for lang in active_langs:
            idx = col_indices[lang]
            if idx < len(row):
                text = row[idx].strip()
                if text:
                    translations[lang] = text
                    max_idx = max(max_idx, idx)

        loc_string = LocString(
            key=key,
            type=entry_type,
            desc=desc,
            translations=translations,
            source_file=file_path.name,
        )
        results.append(loc_string)
        last_entry = loc_string
        # If the row was short, subsequent lines might continue from the last column filled
        current_col_offset = max_idx if len(row) < len(header) else 3  # Default to Korean

    return results


def extract_base_game_strings(
    base_game_path: Path,
    csv_files: list[str],
) -> dict[str, LocString]:
    """
    Extract all localization strings from the base game's CSV files.

    Args:
        base_game_path: Path to the StreamingAssets directory.
        csv_files: List of CSV filenames to parse.

    Returns:
        Dictionary mapping localization key to LocString object.
    """
    all_strings: dict[str, LocString] = {}

    for csv_filename in csv_files:
        csv_path = base_game_path / csv_filename
        if not csv_path.exists():
            print(f"  Warning: {csv_filename} not found at {csv_path}")
            continue

        entries = _parse_csv_content(csv_path)
        for entry in entries:
            all_strings[entry.key] = entry

        print(f"  Parsed {csv_filename}: {len(entries)} entries")

    print(f"  Total base game strings: {len(all_strings)}")
    return all_strings


def extract_mod_strings(mod_path: Path) -> dict[str, LocString]:
    """
    Extract localization strings from a mod directory.

    Searches for CSV files in:
    1. The mod's Localization/ subdirectory.
    2. Any top-level Lang*.csv files.

    Args:
        mod_path: Path to the mod's root directory.

    Returns:
        Dictionary mapping localization key to LocString object.
    """
    all_strings: dict[str, LocString] = {}
    csv_files_found = []

    # Check the Localization subdirectory.
    loc_dir = mod_path / "Localization"
    if loc_dir.exists():
        for csv_file in loc_dir.glob("*.csv"):
            csv_files_found.append(csv_file)

    # Check for top-level Lang*.csv files.
    for csv_file in mod_path.glob("Lang*.csv"):
        if csv_file not in csv_files_found:
            csv_files_found.append(csv_file)

    for csv_file in csv_files_found:
        entries = _parse_csv_content(csv_file)
        for entry in entries:
            all_strings[entry.key] = entry

    return all_strings


def detect_source_language(
    loc_string: LocString,
    source_languages: list[str],
) -> Optional[str]:
    """
    Determine which non-English language column has content for translation.

    Checks source languages in priority order.

    Args:
        loc_string: The localization string to check.
        source_languages: Source languages to check, in priority order.

    Returns:
        The source language name, or None if no source text is found.
    """
    for lang in source_languages:
        if lang in loc_string.translations and loc_string.translations[lang]:
            return lang
    return None


def get_untranslated_strings(
    strings: dict[str, LocString],
    source_languages: list[str],
) -> dict[str, LocString]:
    """
    Filter strings that need English translation.

    Returns entries where the English column is empty but at least one
    source language column has content.

    Args:
        strings: Dictionary of all localization strings.
        source_languages: Source languages to check, in priority order.

    Returns:
        Dictionary of strings that need translation.
    """
    untranslated = {}
    for key, loc_str in strings.items():
        english = loc_str.translations.get("English", "").strip()
        if not english and detect_source_language(loc_str, source_languages) is not None:
            untranslated[key] = loc_str
    return untranslated
