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


# Canonical CSV filenames for Chrono Ark.
_CANONICAL_NAMES = {"LangDataDB.csv", "LangSystemDB.csv", "LangDialogueDB.csv", "LangRecordsDB.csv"}

# Directory names that indicate backups.
_BACKUP_DIR_PATTERNS = {"langbackup", "备份", "备份2", "备份3", "备份4", "备份5"}

# Regex to strip variant suffixes from filenames.
_VARIANT_SUFFIX_RE = re.compile(
    r"( - 副本"            # Chinese "copy"
    r"| \(\d+\)"           # " (1)", " (2)"
    r"|（\d+）"            # fullwidth parens
    r"|_v[\d.]+"           # "_v0.6.13"
    r"|_copy"              # "_copy"
    r"| copy"              # " copy"
    r")(?=\.csv$)",
    re.IGNORECASE,
)


def _fix_oversized_row(
    row: list[str], expected_cols: int, col_indices: dict[str, int]
) -> list[str]:
    """
    Fix a row that has more columns than expected due to unquoted commas.

    Tries merging excess columns at each language-column position and picks
    the merge that best aligns columns with their expected scripts.
    """
    excess = len(row) - expected_cols
    if excess <= 0:
        return row

    language_columns = {"Korean", "English", "Japanese", "Chinese", "Chinese-TW [zh-tw]"}
    lang_positions = sorted(
        idx for lang, idx in col_indices.items() if lang in language_columns
    )
    if not lang_positions:
        return row

    best_row = None
    best_score = -1

    for merge_pos in lang_positions:
        end = merge_pos + excess + 1
        if end > len(row):
            continue
        candidate = (
            row[:merge_pos]
            + [",".join(row[merge_pos:end])]
            + row[end:]
        )

        score = 0
        for lang, idx in col_indices.items():
            if lang not in language_columns or idx >= len(candidate):
                continue
            cell = candidate[idx].strip()
            if not cell:
                continue
            has_hangul = any("\uac00" <= c <= "\ud7af" for c in cell)
            has_kana = any("\u3040" <= c <= "\u30ff" for c in cell)
            has_cjk = any("\u4e00" <= c <= "\u9fff" for c in cell)
            ascii_ratio = sum(1 for c in cell if ord(c) < 128) / len(cell)

            if lang == "English":
                if ascii_ratio > 0.8:
                    score += 2
                if has_hangul or has_kana:
                    score -= 2
            elif lang == "Korean":
                if has_hangul:
                    score += 1
                if ascii_ratio > 0.9 and len(cell) > 10:
                    score -= 1
            elif lang == "Japanese":
                if has_kana:
                    score += 1
            elif lang in ("Chinese", "Chinese-TW [zh-tw]"):
                if has_cjk and not has_hangul and not has_kana:
                    score += 1

        if score > best_score:
            best_score = score
            best_row = candidate

    return best_row if best_row is not None else row


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

        # Fix rows with excess columns caused by unquoted commas in fields.
        if len(row) > len(header):
            row = _fix_oversized_row(row, len(header), col_indices)

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


def find_all_csv_files(mod_path: Path) -> list[Path]:
    """
    Recursively find all CSV files in a mod directory.

    Searches Localization/ subdirectory, top-level Lang*.csv, and any
    variant/backup files in subdirectories.
    """
    found = []
    loc_dir = mod_path / "Localization"

    # Localization/ directory (including subdirs for backups).
    if loc_dir.exists():
        for csv_file in loc_dir.rglob("*.csv"):
            found.append(csv_file)

    # Top-level Lang*.csv files.
    for csv_file in mod_path.glob("Lang*.csv"):
        if csv_file not in found:
            found.append(csv_file)

    # Check known backup directory patterns at top level.
    for subdir in mod_path.iterdir():
        if subdir.is_dir() and subdir.name != "Localization":
            dir_lower = subdir.name.lower()
            is_backup = any(p in dir_lower for p in _BACKUP_DIR_PATTERNS)
            if is_backup:
                for csv_file in subdir.rglob("*.csv"):
                    if csv_file not in found:
                        found.append(csv_file)

    return found


def classify_csv_file(csv_path: Path, loc_dir: Path) -> tuple[str, bool]:
    """
    Classify a CSV file as canonical or variant, and determine its canonical name.

    Args:
        csv_path: Path to the CSV file.
        loc_dir: Path to the Localization/ directory (or mod root).

    Returns:
        Tuple of (canonical_filename, is_canonical).
    """
    filename = csv_path.name

    # Check if in a backup directory.
    in_backup = False
    for part in csv_path.parts:
        part_lower = part.lower()
        if any(p in part_lower for p in _BACKUP_DIR_PATTERNS):
            in_backup = True
            break

    # Strip variant suffixes to find canonical name.
    canonical = _VARIANT_SUFFIX_RE.sub("", filename)

    # If the file is a direct canonical name in the expected dir, it's canonical.
    is_canonical = (
        canonical == filename
        and not in_backup
        and canonical in _CANONICAL_NAMES
    )

    # Top-level file when Localization/ version exists is a variant.
    if is_canonical and csv_path.parent != loc_dir:
        loc_version = loc_dir / canonical
        if loc_version.exists() and csv_path != loc_version:
            is_canonical = False

    return canonical, is_canonical


def extract_mod_strings(mod_path: Path) -> tuple[dict[str, LocString], list[str]]:
    """
    Extract localization strings from a mod directory.

    Scans for all CSV files (including variants/duplicates), deduplicates
    by key (canonical files win), and reports variant files.

    Args:
        mod_path: Path to the mod's root directory.

    Returns:
        Tuple of (strings dict, list of variant file relative paths).
    """
    all_csv_files = find_all_csv_files(mod_path)
    if not all_csv_files:
        return {}, []

    loc_dir = mod_path / "Localization"
    if not loc_dir.exists():
        loc_dir = mod_path

    # Classify files and separate canonical from variants.
    canonical_files: list[Path] = []
    variant_files: list[Path] = []

    for csv_file in all_csv_files:
        _, is_canonical = classify_csv_file(csv_file, loc_dir)
        if is_canonical:
            canonical_files.append(csv_file)
        else:
            variant_files.append(csv_file)

    # Parse variants first so canonical can overwrite on collision.
    all_strings: dict[str, LocString] = {}

    for csv_file in variant_files:
        entries = _parse_csv_content(csv_file)
        for entry in entries:
            if entry.key not in all_strings:
                all_strings[entry.key] = entry

    for csv_file in canonical_files:
        entries = _parse_csv_content(csv_file)
        for entry in entries:
            all_strings[entry.key] = entry

    variant_rel_paths = []
    for v in variant_files:
        try:
            variant_rel_paths.append(str(v.relative_to(mod_path)))
        except ValueError:
            variant_rel_paths.append(str(v))

    return all_strings, variant_rel_paths


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
