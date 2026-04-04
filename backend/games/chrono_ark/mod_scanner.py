"""
Mod scanner for discovering and classifying Chrono Ark workshop mods.

Scans the Steam Workshop directory to find all installed mods, reads
their metadata, and determines what localization resources are available.
"""

import json
from pathlib import Path

from models import LocString
from games.base import ModInfo
from games.chrono_ark.csv_extractor import extract_mod_strings


def _read_mod_metadata(mod_path: Path, metadata_filename: str) -> dict:
    """
    Read mod metadata from the metadata JSON file.

    Args:
        mod_path: Path to the mod's root directory.
        metadata_filename: Name of the metadata JSON file.

    Returns:
        Dictionary of metadata fields, or empty dict if not found.
    """
    json_path = mod_path / metadata_filename
    if not json_path.exists():
        return {}

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def classify_mod(
    mod_path: Path,
    metadata_filename: str,
    skip_dlls: set[str],
) -> ModInfo:
    """
    Analyze a mod directory to determine its localization resources.

    Reads the metadata JSON for metadata, checks for Localization/*.csv
    and Assemblies/*.dll files, and samples CSV content to check if
    English is already populated.

    Args:
        mod_path: Path to the mod's root directory.
        metadata_filename: Name of the metadata JSON file.
        skip_dlls: Set of DLL filenames to skip.

    Returns:
        ModInfo with all discovered information.
    """
    mod_id = mod_path.name
    metadata = _read_mod_metadata(mod_path, metadata_filename)

    info = ModInfo(
        mod_id=mod_id,
        name=metadata.get("id", metadata.get("name", mod_id)),
        author=metadata.get("Uploader", metadata.get("author", "")),
        path=mod_path,
    )

    # Find CSV localization files.
    loc_dir = mod_path / "Localization"
    if loc_dir.exists():
        for csv_file in loc_dir.glob("*.csv"):
            info.loc_file_paths.append(csv_file)

    # Also check for top-level Lang*.csv files.
    for csv_file in mod_path.glob("Lang*.csv"):
        if csv_file not in info.loc_file_paths:
            info.loc_file_paths.append(csv_file)

    info.has_loc_files = len(info.loc_file_paths) > 0

    # Find mod DLLs (excluding known dependencies).
    assemblies_dir = mod_path / "Assemblies"
    if assemblies_dir.exists():
        for dll_file in assemblies_dir.glob("*.dll"):
            if dll_file.name not in skip_dlls:
                info.dll_paths.append(dll_file)

    info.has_dll = len(info.dll_paths) > 0

    # Sample CSV content to check English population and count entries.
    if info.has_loc_files:
        strings = extract_mod_strings(mod_path)
        info.entry_count = len(strings)

        # Check if any entries have English text.
        english_count = sum(
            1 for s in strings.values()
            if s.translations.get("English", "").strip()
        )
        info.target_lang_populated = english_count > 0

    return info


def scan_workshop(
    workshop_path: Path,
    metadata_filename: str,
    skip_dlls: set[str],
) -> list[ModInfo]:
    """
    Scan the Steam Workshop directory to discover all installed mods.

    Args:
        workshop_path: Path to the workshop content directory.
        metadata_filename: Name of the metadata JSON file.
        skip_dlls: Set of DLL filenames to skip.

    Returns:
        List of ModInfo for all discovered mods, sorted by mod_id.
    """
    if not workshop_path.exists():
        print(f"Workshop path not found: {workshop_path}")
        return []

    mods = []
    for mod_dir in sorted(workshop_path.iterdir()):
        if mod_dir.is_dir():
            info = classify_mod(mod_dir, metadata_filename, skip_dlls)
            mods.append(info)

    return mods
