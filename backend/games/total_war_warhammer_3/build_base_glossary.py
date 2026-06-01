"""Build the WH3 base-game terminology glossary from extracted vanilla loc files.

Reads the English per-table TSVs under `vanilla_text_en/db/` and the merged Chinese and Korean
`localisation__.loc.tsv` files, extracts core system terms (stats, attributes, ui_terms, regions),
dedupes by English value, applies per-category exclusions, and writes a `{"terms": {...}}` glossary to the WH3 storage path.
"""

from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from pathlib import Path

from backend.data.glossary_manager import save_glossary
from backend.games.storage_paths import glossary_path

GAME_ID = "total_war_warhammer_3"

# Strips `[[...]]` markup tokens (img, col, b, etc.) and `{{...}}` substitution tokens.
_MARKUP = re.compile(r"\[\[[^\]]*\]\]|\{\{[^}]*\}\}")

# Splits `Term: value` strings on either an ASCII colon or a CJK fullwidth colon (U+FF1A, chr(0xFF1A)).
# Chinese loc values use the fullwidth form, so an ASCII-only split would keep the value attached.
_COLON = re.compile("[:" + chr(0xFF1A) + "]")

# Curated allowlist of system terms, matched case-insensitively against candidate labels.
# Sourced from files where these terms actually live (effects values are `Term: value` prefixes).
UI_TERMS_ALLOWLIST: set[str] = {
    "cooldown",
    "income",
    "upkeep",
    "active time",
    "spell",
    "ability",
    "casualty replenishment rate",
    "maintenance cost",
    "public order",
    "growth",
    "corruption",
}

# Source files scanned for ui_terms. Effects values are `Term: value`, so they use before-colon labels.
_UI_TERM_SOURCES = (
    "random_localisation_strings__.loc.tsv",
    "unit_ability_source_types__.loc.tsv",
    "effects__.loc.tsv",
)

# English terms to drop from the generated glossary, per category. Mostly unit-name attributes and
# niche stats that are not useful base-game terminology.
_EXCLUDED_TERMS: dict[str, frozenset[str]] = {
    "attributes": frozenset(
        {
            "Ballistic Plating",
            "Boar Cavalry",
            "Bound Fire Daemon",
            "Goblin Infantry",
            "Gorger",
            "Kroxigor",
            "Moulder Monster",
            "Nasty Skulker",
            "Night Goblin Archer",
            "Orc Infantry",
            "Skink",
            "Slayer",
            "Spider",
            "Squig",
            "Squig Herd",
            "Tiger Warrior",
            "Troll",
            "Woodsman",
        }
    ),
    "stats": frozenset(
        {
            "Dealt Collision Knocked Back Threshold",
            "Dealt Collision Knocked Down Threshold",
            "Dealt Collision Knocked Flying Threshold",
            "Ship Health",
            "Ship Speed",
        }
    ),
}

# Attribute terms starting with this prefix are dropped (e.g. "Removes Fear", "Removes Unbreakable").
_REMOVES_PREFIX = "Removes "


def _clean(text: str) -> str:
    """Return the clean term name: take the part before `||`, strip markup, collapse whitespace.

    Args:
        text: Raw loc value.

    Returns:
        The cleaned, whitespace-collapsed term name.
    """
    name = text.split("||", 1)[0]
    name = _MARKUP.sub("", name)
    return " ".join(name.split()).strip()


def _term_before_colon(text: str) -> str:
    """Return the label before the first colon (for `Term: value` effect strings).

    Markup is stripped first so a colon inside a tag does not split the label. Splits on either an
    ASCII colon or a CJK fullwidth colon, since Chinese loc values use the fullwidth form.

    Args:
        text: Raw loc value such as `Casualty replenishment rate: %+n% ...`.

    Returns:
        The cleaned label before the first colon.
    """
    stripped = _MARKUP.sub("", text.split("||", 1)[0])
    stripped = " ".join(stripped.split()).strip()
    return _COLON.split(stripped, 1)[0].strip()


def _is_excluded(english: str, category: str) -> bool:
    """Return True when an extracted term should be dropped from the glossary.

    Args:
        english: The cleaned English term.
        category: The term's category.

    Returns:
        True when the term is in the per-category exclusion set, or is a `Removes ...` attribute.
    """
    if english in _EXCLUDED_TERMS.get(category, frozenset()):
        return True
    if category == "attributes" and english.startswith(_REMOVES_PREFIX):
        return True
    return False


def _parse_tsv(path: Path) -> dict[str, str]:
    """Parse a loc TSV into a `key -> text` dict, skipping the two header lines.

    Args:
        path: Path to a `*.loc.tsv` file.

    Returns:
        Mapping of loc key to its raw text value. Empty when the file is missing.
    """
    result: dict[str, str] = {}
    if not path.exists():
        return result
    with path.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i == 0:  # column header: key\ttext\ttooltip
                continue
            line = line.rstrip("\n")
            if not line or line.startswith("#Loc"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            key = parts[0]
            if key:
                result[key] = parts[1]
    return result


def build_glossary(en_db_dir: Path, cn_file: Path, kr_file: Path) -> dict:
    """Build the base-game glossary dict from the vanilla loc files.

    Extracts in priority order [stats, attributes, ui_terms, regions], skips empty and excluded
    English values, and dedupes by normalized (case-insensitive) English so the first occurrence wins.

    Args:
        en_db_dir: Directory holding the English per-table `*.loc.tsv` files.
        cn_file: Path to the merged Chinese `localisation__.loc.tsv`.
        kr_file: Path to the merged Korean `localisation__.loc.tsv`.

    Returns:
        A glossary dict of the form `{"terms": {english: {...}}}`.
    """
    cn = _parse_tsv(cn_file)
    kr = _parse_tsv(kr_file)
    now = datetime.now(timezone.utc).isoformat()
    terms: dict[str, dict] = {}
    seen: set[str] = set()

    def add(english: str, category: str, key: str, source_file: str, colon: bool) -> None:
        if not english or _is_excluded(english, category):
            return
        norm = english.lower()
        if norm in seen:
            return
        seen.add(norm)
        mappings: dict[str, str] = {}
        cn_raw = cn.get(key, "")
        kr_raw = kr.get(key, "")
        cn_val = _term_before_colon(cn_raw) if colon else _clean(cn_raw)
        kr_val = _term_before_colon(kr_raw) if colon else _clean(kr_raw)
        if cn_val:
            mappings["Chinese"] = cn_val
        if kr_val:
            mappings["Korean"] = kr_val
        terms[english] = {
            "english": english,
            "category": category,
            "key": key,
            "source_file": source_file,
            "source_mappings": mappings,
            "created_at": now,
            "updated_at": now,
        }

    # stats: clean onscreen stat names only.
    for key, text in _parse_tsv(en_db_dir / "unit_stat_localisations__.loc.tsv").items():
        if "_onscreen_name_" not in key:
            continue
        add(_clean(text), "stats", key, "unit_stat_localisations__.loc.tsv", colon=False)

    # attributes: name before `||`.
    for key, text in _parse_tsv(en_db_dir / "unit_attributes__.loc.tsv").items():
        add(_clean(text), "attributes", key, "unit_attributes__.loc.tsv", colon=False)

    # ui_terms: curated allowlist across multiple files.
    for fname in _UI_TERM_SOURCES:
        is_effects = fname == "effects__.loc.tsv"
        for key, text in _parse_tsv(en_db_dir / fname).items():
            candidate = _term_before_colon(text) if is_effects else _clean(text)
            if candidate.lower() in UI_TERMS_ALLOWLIST:
                add(candidate, "ui_terms", key, fname, colon=is_effects)

    # regions: canonical onscreen names only.
    for key, text in _parse_tsv(en_db_dir / "regions__.loc.tsv").items():
        if not key.startswith("regions_onscreen_"):
            continue
        add(_clean(text), "regions", key, "regions__.loc.tsv", colon=False)

    return {"terms": terms}


def main(argv: list[str] | None = None) -> None:
    """CLI entrypoint: build the glossary from the vanilla folders and write it to storage.

    Args:
        argv: Optional argument list (defaults to `sys.argv`).
    """
    parser = argparse.ArgumentParser(description="Build the WH3 base-game terminology glossary.")
    parser.add_argument("--vanilla-root", type=Path, default=Path("."), help="Folder containing vanilla_text_en/cn/kr.")
    parser.add_argument("--out", type=Path, default=None, help="Output glossary.json path (defaults to WH3 storage).")
    args = parser.parse_args(argv)

    en_db = args.vanilla_root / "vanilla_text_en" / "db"
    cn_file = args.vanilla_root / "vanilla_text_cn" / "text" / "localisation__.loc.tsv"
    kr_file = args.vanilla_root / "vanilla_text_kr" / "text" / "localisation__.loc.tsv"

    glossary = build_glossary(en_db, cn_file, kr_file)
    out = args.out if args.out is not None else glossary_path(GAME_ID)
    save_glossary(glossary, out)
    print(f"Wrote {len(glossary['terms'])} terms to {out}")


if __name__ == "__main__":
    main()
