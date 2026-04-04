"""
Glossary manager for consistent English terminology.

Builds and maintains a glossary of official English game terms extracted
from the base game's localization files. The glossary maps source language
terms to their canonical English translations. Supports per-mod glossaries
that overlay the base game glossary.
"""

import json
from pathlib import Path
from typing import Optional

import config
from models import LocString


# Common game terms to auto-extract from the base game.
_NAME_KEY_SUFFIXES = ("_Name", "_name")

# Keyword key prefixes that contain game mechanic terms.
_KEYWORD_PREFIXES = ("SkillKeyword/", "Battle/Keyword/")

# Universal game mechanic terms to seed into the base glossary.
MECHANIC_SEED_TERMS = {
    "Debuff": "A negative status effect",
    "Buff": "A positive status effect",
    "Weakening": "Reduces target's damage",
    "Armor Reduced": "Lowers target's defense",
    "Damage": "Amount of harm dealt",
    "Accuracy": "Chance to hit",
    "Critical Chance": "Chance for critical hit",
    "Overload": "Exceeding action limit",
    "Swiftness": "Ignores action counts",
    "Action Count": "Number of actions per turn",
    "Defense": "Damage reduction stat",
    "HP": "Health points",
    "Shield": "Temporary damage absorption",
    "Apply": "Inflict a status effect",
    "Deal": "Inflict damage",
    "Restore": "Recover HP or resource",
    "Increase": "Raise a stat value",
    "Decrease": "Lower a stat value",
    "Remove": "Clear a status effect",
    "Penetration": "Ignore defense",
    "Exhaust": "Card is removed after use",
    "Dispose": "Card is removed from deck",
}


def build_glossary_from_base_game(
    base_strings: dict[str, LocString],
    term_categories: dict[str, str],
    source_languages: list[str],
    keyword_prefixes: list[str] | None = None,
) -> dict[str, dict]:
    """
    Auto-build a glossary from the base game's localization data.

    Extracts name entries (keys ending in _Name or _name), keyword entries
    (matching keyword_prefixes), and seeds universal mechanic terms.

    Args:
        base_strings: Dictionary of base game LocString objects.
        term_categories: Category name -> key prefix mappings.
        source_languages: List of source language names to include.
        keyword_prefixes: Optional list of key prefixes for mechanic keywords.

    Returns:
        Glossary dictionary.
    """
    glossary: dict[str, dict] = {"terms": {}}
    kw_prefixes = keyword_prefixes or list(_KEYWORD_PREFIXES)

    for key, loc_str in base_strings.items():
        is_name_key = any(key.endswith(suffix) for suffix in _NAME_KEY_SUFFIXES)
        is_keyword = any(key.startswith(p) for p in kw_prefixes) and is_name_key

        if not is_name_key and not is_keyword:
            continue

        english = loc_str.translations.get("English", "").strip()
        if not english:
            continue

        # Determine the category.
        if is_keyword:
            category = "mechanics"
        else:
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

    # Add seed mechanic terms (don't overwrite existing entries).
    for term in MECHANIC_SEED_TERMS:
        if term not in glossary["terms"]:
            glossary["terms"][term] = {
                "category": "mechanics",
                "key": "",
                "source_mappings": {},
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


def get_glossary_prompt(
    glossary: dict,
    allowed_categories: list[str] | None = None,
    source_lang: str | None = None,
) -> str:
    """
    Format the glossary as context for an LLM translation prompt.

    Args:
        glossary: The glossary dictionary.
        allowed_categories: If provided, only include terms from these categories.
            Defaults to config.GLOSSARY_CATEGORIES.
        source_lang: If provided, only include mappings for this language.
            This significantly reduces prompt size.

    Returns:
        Formatted string suitable for use as LLM system prompt context.
    """
    if not glossary.get("terms"):
        return ""

    if allowed_categories is None:
        allowed_categories = config.GLOSSARY_CATEGORIES

    lines = [
        "## Game Terminology Glossary",
        "",
        "Use these EXACT English terms when translating. Do not paraphrase:",
        "",
    ]

    # Group by category, filtering to allowed categories.
    by_category: dict[str, list[tuple[str, dict]]] = {}
    for english_term, info in glossary["terms"].items():
        cat = info.get("category", "other")
        if allowed_categories and cat not in allowed_categories:
            continue

        mappings = info.get("source_mappings", {})
        if source_lang:
            # Only include terms that have a mapping for the source language.
            if source_lang not in mappings:
                continue

        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append((english_term, info))

    if not by_category:
        return ""

    for category, terms in sorted(by_category.items()):
        lines.append(f"### {category.title()}")
        for english_term, info in sorted(terms, key=lambda x: x[0]):
            mappings = info.get("source_mappings", {})
            if mappings:
                if source_lang and source_lang in mappings:
                    mapping_str = f"{source_lang}: {mappings[source_lang]}"
                else:
                    mapping_str = ", ".join(
                        f"{lang}: {text}" for lang, text in mappings.items()
                    )
                lines.append(f"- **{english_term}** ← {mapping_str}")
            else:
                lines.append(f"- **{english_term}**")
        lines.append("")

    return "\n".join(lines)


def load_mod_glossary(mod_id: str, storage_path: Optional[Path] = None) -> dict:
    """
    Load a mod-specific glossary.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path. Defaults to config.STORAGE_PATH.

    Returns:
        Glossary dictionary, or empty structure if none exists.
    """
    if storage_path is None:
        storage_path = config.STORAGE_PATH
    path = storage_path / "mods" / mod_id / "glossary.json"
    if not path.exists():
        return {"terms": {}}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_mod_glossary(mod_id: str, glossary: dict, storage_path: Optional[Path] = None) -> None:
    """
    Save a mod-specific glossary.

    Args:
        mod_id: The mod's Workshop ID.
        glossary: The glossary dictionary to save.
        storage_path: Base storage path. Defaults to config.STORAGE_PATH.
    """
    if storage_path is None:
        storage_path = config.STORAGE_PATH
    path = storage_path / "mods" / mod_id / "glossary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(glossary, f, indent=2, ensure_ascii=False)


def merge_glossaries(base: dict, mod: dict) -> dict:
    """
    Merge base game and mod glossaries. Mod terms override base on collision.

    Args:
        base: The base game glossary.
        mod: The mod-specific glossary.

    Returns:
        Merged glossary dictionary.
    """
    merged_terms = {**base.get("terms", {}), **mod.get("terms", {})}
    return {"terms": merged_terms}


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
