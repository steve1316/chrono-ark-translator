"""
Glossary manager for consistent English terminology.

Builds and maintains a glossary of official English game terms extracted
from the base game's localization files. The glossary maps source language
terms to their canonical English translations. Supports per-mod glossaries
that overlay the base game glossary.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from backend import config
from backend.models import LocString


# Common game terms to auto-extract from the base game.
_NAME_KEY_SUFFIXES = ("_Name", "_name", "_PassiveName", "_SkinName")

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

# Suffix-to-category mapping for mod name-key auto-detection.
_SUFFIX_CATEGORY: dict[str, str] = {
    "_PassiveName": "passives",
    "_SkinName": "other",
    "_Name": "names",
    "_name": "names",
}

# Key prefixes whose `_Name` values are descriptions, not actual names.
_IGNORED_NAME_KEY_PREFIXES = ("SkillExtended/",)


def _matches_prefix(key: str, prefix: str | list[str]) -> bool:
    """Check if a key starts with any of the given prefix(es)."""
    if isinstance(prefix, list):
        return any(key.startswith(p) for p in prefix)
    return key.startswith(prefix)


def build_glossary_from_base_game(
    base_strings: dict[str, LocString],
    term_categories: dict[str, str | list[str]],
    source_languages: list[str],
    keyword_prefixes: list[str] | None = None,
) -> dict[str, dict]:
    """
    Auto-build a glossary from the base game's localization data.

    Extracts name entries (keys ending in _Name, _name, _PassiveName, or
    _SkinName), keyword entries (matching keyword_prefixes), and seeds
    universal mechanic terms.

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

        english = loc_str.translations.get("English", "").strip().split("\n")[0].strip()
        if not english:
            continue

        # Determine the category.
        if is_keyword:
            category = "mechanics"
        else:
            category = "other"
            for cat_name, prefix in term_categories.items():
                if _matches_prefix(key, prefix):
                    category = cat_name
                    break
            # Suffix and specific key patterns override prefix-based category.
            if key.endswith("_PassiveName"):
                category = "passives"
            elif key.endswith("_SkinName"):
                category = "other"
            elif key.startswith("Character/AllyDoll_"):
                category = "other"

        # Build source language mappings.
        source_mappings = {}
        for lang in source_languages:
            text = loc_str.translations.get(lang, "").strip().split("\n")[0].strip()
            if text:
                source_mappings[lang] = text

        now = datetime.now(timezone.utc).isoformat()
        glossary["terms"][english] = {
            "category": category,
            "key": key,
            "source_file": loc_str.source_file,
            "source_mappings": source_mappings,
            "created_at": now,
            "updated_at": now,
        }

    # Add seed mechanic terms (don't overwrite existing entries).
    for term in MECHANIC_SEED_TERMS:
        if term not in glossary["terms"]:
            now = datetime.now(timezone.utc).isoformat()
            glossary["terms"][term] = {
                "category": "mechanics",
                "key": "",
                "source_file": "",
                "source_mappings": {},
                "created_at": now,
                "updated_at": now,
            }

    return glossary


def extract_name_key_suggestions(
    translated_keys: list[str],
    strings: dict[str, LocString],
    translations: dict[str, str],
    source_lang: str,
    existing_suggestions: list[dict],
    mod_glossary: dict,
    term_categories: dict[str, str | list[str]] | None = None,
) -> list[dict]:
    """Extract glossary suggestions from translated name keys.

    Scans the translated keys for entries ending in name suffixes
    (`_Name`, `_name`, `_PassiveName`, `_SkinName`). Any such entry whose
    English translation is not already in the mod glossary or pending
    suggestions is returned as a new suggestion marked as auto-detected.

    Args:
        translated_keys: Keys that were just translated.
        strings: Full strings dict mapping key -> LocString.
        translations: Key -> English translation mapping from the provider.
        source_lang: Source language name (e.g. `"Korean"`).
        existing_suggestions: Already-pending suggestion dicts for dedup.
        mod_glossary: The mod's current glossary dict.
        term_categories: Optional category name -> key prefix mappings for
            categorising suggestions (e.g. `{"characters": "Character/"}`).

    Returns:
        List of new suggestion dicts ready to be stored.
    """
    existing_english = {s.get("english", "") for s in existing_suggestions}
    glossary_terms = set(mod_glossary.get("terms", {}).keys())
    categories = term_categories or {}
    new_suggestions: list[dict] = []

    for key in translated_keys:
        # Check longest suffixes first so _PassiveName matches before _Name.
        matched_suffix = ""
        for suffix in _SUFFIX_CATEGORY:
            if key.endswith(suffix) and len(suffix) > len(matched_suffix):
                matched_suffix = suffix
        if not matched_suffix:
            continue

        # Skip prefixes whose _Name fields hold descriptions, not names.
        if any(key.startswith(p) for p in _IGNORED_NAME_KEY_PREFIXES):
            continue

        english = translations.get(key, "").strip()
        if not english:
            continue

        # Skip if already known.
        if english in existing_english or english in glossary_terms:
            continue

        # Determine source text.
        loc_str = strings.get(key)
        source_text = ""
        if loc_str:
            source_text = loc_str.translations.get(source_lang, "").strip()

        # Determine category from key prefix or suffix default.
        category = _SUFFIX_CATEGORY[matched_suffix]
        for cat_name, prefix in categories.items():
            if _matches_prefix(key, prefix):
                category = cat_name
                break

        new_suggestions.append(
            {
                "english": english,
                "source": source_text,
                "source_lang": source_lang,
                "category": category,
                "reason": "Auto-detected from name key after translation",
            }
        )
        existing_english.add(english)

    return new_suggestions


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
        category: Term category (e.g., "characters", "buffs/debuffs", "custom").

    Returns:
        The modified glossary dictionary.
    """
    if "terms" not in glossary:
        glossary["terms"] = {}

    now = datetime.now(timezone.utc).isoformat()
    existing = glossary["terms"].get(english_term)
    created_at = existing.get("created_at", now) if existing else now

    glossary["terms"][english_term] = {
        "category": category,
        "key": "",
        "source_file": "",
        "source_mappings": source_mappings or {},
        "created_at": created_at,
        "updated_at": now,
    }

    return glossary


def get_glossary_prompt(
    glossary: dict,
    allowed_categories: list[str] | None = None,
    source_lang: str | None = None,
    exclude_terms: set[str] | None = None,
) -> str:
    """
    Format the glossary as context for an LLM translation prompt.

    Args:
        glossary: The glossary dictionary.
        allowed_categories: If provided, only include terms from these categories.
            Defaults to config.GLOSSARY_CATEGORIES. Pass an empty list to
            disable category filtering entirely.
        source_lang: If provided, only include mappings for this language.
            This significantly reduces prompt size.
        exclude_terms: If provided, skip any term whose key is in this set.

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
        if exclude_terms and english_term in exclude_terms:
            continue
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
                    mapping_str = ", ".join(f"{lang}: {text}" for lang, text in mappings.items())
                lines.append(f"- **{english_term}** ← {mapping_str}")
            else:
                lines.append(f"- **{english_term}**")
        lines.append("")

    return "\n".join(lines)


def get_combined_glossary_prompt(
    base: dict,
    mod: dict,
    source_lang: str | None = None,
) -> str:
    """
    Build a glossary prompt from base and mod glossaries.

    Base glossary terms are filtered by config.GLOSSARY_CATEGORIES to control
    prompt size. Mod glossary terms are always included (user-curated).
    Mod terms that override base terms appear only once (unfiltered).

    Args:
        base: The base game glossary.
        mod: The mod-specific glossary.
        source_lang: If provided, only include mappings for this language.

    Returns:
        Combined formatted glossary prompt string.
    """
    mod_term_keys = set(mod.get("terms", {}).keys())

    base_prompt = get_glossary_prompt(
        base,
        allowed_categories=config.GLOSSARY_CATEGORIES,
        source_lang=source_lang,
        exclude_terms=mod_term_keys,
    )
    # Pass empty list to disable category filtering for mod terms.
    mod_prompt = get_glossary_prompt(mod, allowed_categories=[], source_lang=source_lang)

    if base_prompt and mod_prompt:
        # Strip the duplicate header from the mod prompt and append its terms.
        mod_body = mod_prompt.split("\n\n", 2)
        if len(mod_body) > 2:
            return base_prompt + "\n" + mod_body[2]
        return base_prompt + "\n" + mod_prompt
    return mod_prompt or base_prompt


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
