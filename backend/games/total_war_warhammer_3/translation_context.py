"""WH3-specific text injected into LLM translation prompts.

Consumed by `TotalWarWarhammer3Adapter` via the `TranslationCapability`
methods `get_translation_context`, `get_format_preservation_rules`,
`get_style_examples`, and `get_glossary_categories`.
"""

from __future__ import annotations

GAME_CONTEXT = (
    "Total War: Warhammer III - community mods for the strategy game. "
    "Translate Chinese game text into natural English. Preserve official WH3 "
    "terminology (Lord, Hero, Unit, Faction names like Cathay/Empire/Greenskins, "
    "lores of magic, etc.). Many translations cover unit names, ability descriptions, "
    "lord backgrounds, and faction lore for fan-made Cathay-themed mods."
)

FORMAT_PRESERVATION_RULES: list[str] = [
    "Preserve all `[[col:...]]...[[/col]]` color tags verbatim, including the closing tag.",
    "Preserve `[[img:...]]` image tokens verbatim.",
    "Preserve substitution tokens of the form `%N%`, `{0}`, `{{...}}`, and `<<...>>` verbatim.",
    "Preserve literal `\\n` line breaks; do not insert or remove them.",
    "Preserve leading/trailing whitespace exactly as it appears in the source string.",
    "Do not translate game-internal keys or identifiers that appear in the text.",
]

STYLE_EXAMPLES_BY_LANG: dict[str, list[tuple[str, str]]] = {
    "Chinese": [
        ("[[col:yellow]]近卫军[[/col]]", "[[col:yellow]]Battleguard[[/col]]"),
        ("一支由凯薩之鸟召唤的精锐部队。", "An elite force summoned by the Cathayan Phoenix."),
        ("它们用毒匕攻击敌人, 拥有出色的护甲。", "They attack enemies with venomous daggers and have excellent armor."),
    ],
}

GLOSSARY_CATEGORIES: dict[str, str | list[str]] = {
    "factions": "Faction names (e.g. Cathay, Empire, Greenskins, Khorne).",
    "lords_heroes": "Named legendary lords and heroes (e.g. Miao Ying, Zhao Ming).",
    "unit_types": "Unit category names (Battleguard, Dragon Guard, Crane Gunner).",
    "abilities": "Ability and spell names (Wind of Death, Phoenix Roar).",
    "lore_terms": "Lore/setting-specific terms (Wu-Xing Compass, Great Bastion).",
    "technologies": "Technology and rite names.",
    "items": "Item, weapon, and armor names.",
}

# Base-glossary categories injected into the translation prompt. `regions` is intentionally
# excluded - it holds ~900 proper nouns that would bloat every prompt. They remain available
# in the glossary file and the Glossary page.
BASE_GLOSSARY_PROMPT_CATEGORIES: list[str] = ["stats", "attributes", "ui_terms"]
