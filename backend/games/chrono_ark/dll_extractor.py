"""
DLL string extractor for Chrono Ark mod assemblies.

Uses the dotnetfile library to extract strings from the .NET #US
(User Strings) metadata heap without requiring the .NET runtime.

Includes IL-level analysis to find consecutive ``ldstr`` pairs, which
represent key/value arguments to localization registration calls.
"""

import re
import struct
from pathlib import Path
from typing import Optional

from models import LocString


def _load_dotnet_pe(dll_path: Path):
    """Load a .NET PE file, returning the DotNetPE object or None."""
    try:
        from dotnetfile import DotNetPE
    except ImportError:
        print("  Error: dotnetfile is not installed. Run: pip install dotnetfile")
        return None

    try:
        return DotNetPE(str(dll_path))
    except Exception as e:
        print(f"  Error reading {dll_path.name}: {e}")
        return None


def _build_us_heap_map(dotnet_file) -> dict[int, str]:
    """Build a mapping of #US heap offset -> string."""
    us_map: dict[int, str] = {}
    lookup = getattr(dotnet_file, "dotnet_user_string_lookup", None)
    if not lookup:
        return us_map
    for offset in lookup.keys():
        try:
            text = dotnet_file.get_user_string(offset)
            if text and isinstance(text, str) and text.strip():
                us_map[offset] = text.strip()
        except Exception:
            continue
    return us_map


def _is_loc_key(s: str) -> bool:
    """Check if a string looks like a Chrono Ark localization key."""
    if not s or " " in s:
        return False
    return bool(re.match(r"^[A-Za-z0-9_\-\./]+$", s))


def _has_cjk(s: str) -> bool:
    """Check if a string contains CJK characters."""
    for ch in s:
        cp = ord(ch)
        if (0x4E00 <= cp <= 0x9FFF      # CJK Unified Ideographs
                or 0x3400 <= cp <= 0x4DBF   # CJK Extension A
                or 0xAC00 <= cp <= 0xD7AF   # Hangul Syllables
                or 0x3040 <= cp <= 0x309F   # Hiragana
                or 0x30A0 <= cp <= 0x30FF): # Katakana
            return True
    return False


def extract_dll_strings(dll_path: Path) -> list[str]:
    """
    Extract all user strings from a .NET assembly's #US metadata heap.

    Args:
        dll_path: Path to the .NET DLL file.

    Returns:
        List of extracted strings.
    """
    dotnet_file = _load_dotnet_pe(dll_path)
    if not dotnet_file:
        return []

    us_map = _build_us_heap_map(dotnet_file)
    return list(us_map.values())


def extract_dll_loc_strings(
    dll_path: Path,
    source_file_label: str = "",
) -> dict[str, LocString]:
    """
    Extract structured localization key-value pairs from a .NET assembly
    by analysing IL ``ldstr`` instruction pairs.

    Scans the raw DLL bytes for consecutive ``ldstr`` opcodes (0x72) that
    reference the #US heap.  When a pair consists of one ASCII key and one
    CJK-text value, it is treated as a localization registration call
    (e.g. ``AddText(key, value)`` or ``AddText(value, key)``).

    Args:
        dll_path: Path to the .NET DLL file.
        source_file_label: Value to set on ``LocString.source_file``.

    Returns:
        Dictionary mapping localization key to LocString.
    """
    dotnet_file = _load_dotnet_pe(dll_path)
    if not dotnet_file:
        return {}

    us_map = _build_us_heap_map(dotnet_file)
    if not us_map:
        return {}

    # Scan raw bytes for ldstr (0x72) instructions referencing #US tokens.
    data = dll_path.read_bytes()
    ldstr_hits: list[tuple[int, int, str]] = []  # (byte_pos, us_offset, text)

    for i in range(len(data) - 4):
        if data[i] == 0x72:
            token = struct.unpack_from("<I", data, i + 1)[0]
            if (token >> 24) == 0x70:
                us_offset = token & 0x00FFFFFF
                if us_offset in us_map:
                    ldstr_hits.append((i, us_offset, us_map[us_offset]))

    # Find consecutive ldstr pairs (gap == 5 means back-to-back instructions).
    results: dict[str, LocString] = {}
    MAX_GAP = 10  # Allow small gap for optional opcodes between two ldstr.

    for idx in range(len(ldstr_hits) - 1):
        pos1, _, str1 = ldstr_hits[idx]
        pos2, _, str2 = ldstr_hits[idx + 1]
        if pos2 - pos1 > MAX_GAP:
            continue

        # Determine which is the key and which is the value.
        key: Optional[str] = None
        value: Optional[str] = None

        if _is_loc_key(str1) and _has_cjk(str2):
            key, value = str1, str2
        elif _has_cjk(str1) and _is_loc_key(str2):
            key, value = str2, str1
        else:
            continue

        # Skip keys that are clearly not localization text
        # (asset paths, prefab names, image references, etc.).
        if key.endswith((".prefab", ".asset", ".png", ".jpg")):
            continue
        if "/" in key and not key.startswith("Text"):
            continue

        if key not in results:
            results[key] = LocString(
                key=key,
                type="Text",
                desc="(extracted from DLL)",
                translations={"Chinese": value},
                source_file=source_file_label,
            )

    return results


def _is_noise_string(s: str, min_string_length: int) -> bool:
    """
    Determine if a string is likely .NET metadata noise rather than
    user-facing localizable text.

    Args:
        s: The string to check.
        min_string_length: Minimum length for a string to be considered meaningful.

    Returns:
        True if the string should be filtered out.
    """
    # Too short to be meaningful text.
    if len(s) < min_string_length:
        return True

    # File paths and URLs.
    if "/" in s and "." in s and " " not in s:
        return True
    if s.startswith("http://") or s.startswith("https://"):
        return True
    if "\\" in s and "." in s:
        return True

    # .NET namespaces and type references (dot-separated PascalCase).
    if re.match(r"^[A-Z][a-zA-Z0-9]+(\.[A-Z][a-zA-Z0-9]+)+$", s):
        return True

    # Pure PascalCase identifiers without spaces (likely class/method names).
    if re.match(r"^[A-Z][a-zA-Z0-9]+$", s) and " " not in s:
        return True

    # Version strings.
    if re.match(r"^\d+\.\d+(\.\d+)*$", s):
        return True

    # Single characters or repeated characters.
    if len(set(s)) <= 1:
        return True

    # Known .NET format strings.
    if s in ("{0}", "{1}", "{0} {1}", "null", "true", "false"):
        return True

    return False


def filter_localizable_strings(
    strings: list[str],
    min_string_length: int,
) -> list[str]:
    """
    Filter extracted DLL strings to keep only likely user-facing text.

    Removes .NET noise like type names, file paths, format strings, etc.

    Args:
        strings: Raw list of extracted strings.
        min_string_length: Minimum length for a string to be considered meaningful.

    Returns:
        Filtered list of potentially localizable strings.
    """
    return [s for s in strings if not _is_noise_string(s, min_string_length)]


def _is_mod_dll(dll_name: str, skip_dlls: set[str]) -> bool:
    """
    Determine if a DLL is the mod's own assembly vs a known dependency.

    Args:
        dll_name: Filename of the DLL.
        skip_dlls: Set of DLL filenames to skip.

    Returns:
        True if this appears to be the mod's own DLL.
    """
    return dll_name not in skip_dlls


def extract_mod_dll_strings(
    mod_path: Path,
    skip_dlls: set[str],
    min_string_length: int,
) -> list[str]:
    """
    Extract localizable strings from a mod's DLL assemblies (flat list).

    Identifies the mod's own DLL (skipping known dependencies like
    0Harmony.dll, Mono.Cecil.dll, etc.) and extracts user strings.

    Args:
        mod_path: Path to the mod's root directory.
        skip_dlls: Set of DLL filenames to skip.
        min_string_length: Minimum length for a string to be considered meaningful.

    Returns:
        Filtered list of potentially localizable strings.
    """
    assemblies_dir = mod_path / "Assemblies"
    if not assemblies_dir.exists():
        return []

    all_strings = []

    for dll_file in assemblies_dir.glob("*.dll"):
        if not _is_mod_dll(dll_file.name, skip_dlls):
            continue

        print(f"  Extracting strings from {dll_file.name}...")
        raw_strings = extract_dll_strings(dll_file)
        filtered = filter_localizable_strings(raw_strings, min_string_length)
        all_strings.extend(filtered)
        print(f"    Found {len(raw_strings)} raw, {len(filtered)} after filtering")

    return all_strings


def extract_mod_dll_loc_strings(
    mod_path: Path,
    skip_dlls: set[str],
) -> dict[str, LocString]:
    """
    Extract structured localization key-value pairs from a mod's DLL assemblies.

    Uses IL-level analysis to find ``ldstr`` pairs that represent
    localization registration calls. Returns LocString objects compatible
    with the CSV extraction pipeline.

    Args:
        mod_path: Path to the mod's root directory.
        skip_dlls: Set of DLL filenames to skip.

    Returns:
        Dictionary mapping localization key to LocString.
    """
    assemblies_dir = mod_path / "Assemblies"
    if not assemblies_dir.exists():
        return {}

    all_strings: dict[str, LocString] = {}

    for dll_file in assemblies_dir.glob("*.dll"):
        if not _is_mod_dll(dll_file.name, skip_dlls):
            continue

        print(f"  Extracting loc pairs from {dll_file.name}...")
        loc_strings = extract_dll_loc_strings(dll_file, source_file_label=dll_file.name)
        all_strings.update(loc_strings)
        print(f"    Found {len(loc_strings)} localization key-value pairs")

    return all_strings
