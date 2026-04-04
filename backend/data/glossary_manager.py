"""
Glossary manager for consistent English terminology.

Builds and maintains a glossary of official English game terms extracted
from the base game's localization files. The glossary maps source language
terms to their canonical English translations.
"""

import json
from pathlib import Path
from typing import Optional

import config
from models import LocString


# Common game terms to auto-extract from the base game.
# These are patterns to look for in name-type keys.
_NAME_KEY_SUFFIXES = ("_Name", "_name")


def build_glossary_from_base_game(
    base_strings: dict[str, LocString],
    term_categories: dict[str, str],
    source_languages: list[str],
) -> dict[str, dict]:
    """
    Auto-build a glossary from the base game's localization data.

    Extracts name entries (keys ending in _Name or _name) and creates
    source→English mappings for all available source languages.

    Args:
        base_strings: Dictionary of base game LocString objects.
        term_categories: Category name → key prefix mappings
            (e.g., {"buffs": "Buff/", "characters": "Character/"}).
        source_languages: List of source language names to include
            in the glossary mappings.

    Returns:
        Glossary dictionary with structure:
        {
            "terms": {
                "English Term": {
                    "category": "buffs",
                    "key": "Buff/B_Example_Name",
                    "source_mappings": {"Chinese": "中文名", "Korean": "한국어명", ...}
                }
            }
        }
    """
    glossary = {"terms": {}}

    for key, loc_str in base_strings.items():
        # Only extract name entries for the glossary.
        is_name_key = any(key.endswith(suffix) for suffix in _NAME_KEY_SUFFIXES)
        if not is_name_key:
            continue

        english = loc_str.translations.get("English", "").strip()
        if not english:
            continue

        # Determine the category.
        category = "other"
        for cat_name, prefix in term_categories.items():
            if key.startswith(prefix):
                category = cat_name
                break

        # Build source language mappings.
        source_mappings = {}
        for lang in source_languages:
            text = loc_str.translations.get(lang, "").strip()
            if text:
                source_mappings[lang] = text

        glossary["terms"][english] = {
            "category": category,
            "key": key,
            "source_mappings": source_mappings,
        }

    return glossary


def load_glossary(path: Optional[Path] = None) -> dict:
    """
    Load the glossary from a JSON file.

    Args:
        path: Path to the glossary file. Defaults to storage/glossary.json.

    Returns:
        Glossary dictionary, or empty structure if file doesn't exist.
    """
    if path is None:
        path = config.STORAGE_PATH / "glossary.json"

    if not path.exists():
        return {"terms": {}}

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_glossary(glossary: dict, path: Optional[Path] = None) -> None:
    """
    Save the glossary to a JSON file.

    Args:
        glossary: The glossary dictionary to save.
        path: Path to save to. Defaults to storage/glossary.json.
    """
    if path is None:
        path = config.STORAGE_PATH / "glossary.json"

    path.parent.mkdir(parents=True, exist_ok=True)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(glossary, f, indent=2, ensure_ascii=False)

    print(f"  Glossary saved to {path} ({len(glossary.get('terms', {}))} terms)")


def add_glossary_term(
    glossary: dict,
    english_term: str,
    source_mappings: Optional[dict[str, str]] = None,
    category: str = "custom",
) -> dict:
    """
    Add or update a term in the glossary.

    Args:
        glossary: The glossary dictionary to modify.
        english_term: The canonical English term.
        source_mappings: Optional source language mappings.
        category: Term category (e.g., "characters", "buffs", "custom").

    Returns:
        The modified glossary dictionary.
    """
    if "terms" not in glossary:
        glossary["terms"] = {}

    glossary["terms"][english_term] = {
        "category": category,
        "key": "",
        "source_mappings": source_mappings or {},
    }

    return glossary


def get_glossary_prompt(glossary: dict) -> str:
    """
    Format the glossary as context for an LLM translation prompt.

    Creates a structured text block listing all canonical English terms
    with their source language equivalents, so the LLM can use them
    consistently during translation.

    Args:
        glossary: The glossary dictionary.

    Returns:
        Formatted string suitable for use as LLM system prompt context.
    """
    if not glossary.get("terms"):
        return ""

    lines = [
        "## Game Terminology Glossary",
        "",
        "Use these EXACT English terms when translating. Do not paraphrase:",
        "",
    ]

    # Group by category.
    by_category: dict[str, list[tuple[str, dict]]] = {}
    for english_term, info in glossary["terms"].items():
        cat = info.get("category", "other")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append((english_term, info))

    for category, terms in sorted(by_category.items()):
        lines.append(f"### {category.title()}")
        for english_term, info in sorted(terms, key=lambda x: x[0]):
            mappings = info.get("source_mappings", {})
            if mappings:
                mapping_str = ", ".join(
                    f"{lang}: {text}" for lang, text in mappings.items()
                )
                lines.append(f"- **{english_term}** ← {mapping_str}")
            else:
                lines.append(f"- **{english_term}**")
        lines.append("")

    return "\n".join(lines)


def print_glossary(glossary: dict) -> None:
    """
    Print the glossary in a human-readable format.

    Args:
        glossary: The glossary dictionary to display.
    """
    terms = glossary.get("terms", {})
    if not terms:
        print("Glossary is empty.")
        return

    # Group by category.
    by_category: dict[str, list[str]] = {}
    for english_term, info in terms.items():
        cat = info.get("category", "other")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(english_term)

    for category, term_list in sorted(by_category.items()):
        print(f"\n=== {category.upper()} ({len(term_list)} terms) ===")
        for term in sorted(term_list):
            info = terms[term]
            mappings = info.get("source_mappings", {})
            if mappings:
                first_mapping = next(iter(mappings.values()))
                print(f"  {term} ← {first_mapping}")
            else:
                print(f"  {term}")

    print(f"\nTotal: {len(terms)} terms")
