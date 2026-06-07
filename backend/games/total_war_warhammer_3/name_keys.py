"""Classify WH3 loc keys as named-entity terms (unit / skill / building / location / ...).

Used by the 'Translate Names First' pass: only short NAME strings are translated in the first pass and routed into the glossary, so the subsequent bulk
translation prompts carry those established terms. Detection is by key prefix - WH3 loc keys follow game-wide table-name conventions (e.g.
`land_units_onscreen_name_<id>`), so a curated prefix -> category map classifies names reliably. Descriptions, tooltips, and effects (which are
`effects_description_*`, not names) return None and translate in the bulk pass.
"""

from __future__ import annotations

# Curated map of WH3 name-table key prefixes to a coarse category. Grounded in real parent-pack data. A key matches a prefix only at a token boundary
# (exact match or prefix followed by `_`), so `land_units_onscreen_namex` does not match `land_units_onscreen_name`.
_NAME_PREFIX_CATEGORIES: dict[str, str] = {
    # Units and characters.
    "land_units_onscreen_name": "unit",
    "land_units_concealed_name": "unit",
    "agent_subtypes_onscreen_name": "unit",
    "units_custom_battle_mounts_mount_name": "unit",
    "units_custom_battle_types_type_name": "unit",
    "commodity_unit_name": "unit",
    "names_name": "unit",
    # Skills and abilities.
    "unit_abilities_onscreen_name": "skill",
    "special_ability_phases_onscreen_name": "skill",
    "character_skills_localised_name": "skill",
    # Buildings.
    "battlefield_buildings_names_onscreen_name": "building",
    "building_culture_variants_name": "building",
    "battlefield_buildings_name": "building",
    "building_chains_encyclopedia_name": "building",
    # Locations.
    "start_pos_settlements_onscreen_name": "location",
    "regions_battle_name": "location",
    # Other named entities.
    "ancillaries_onscreen_name": "item",
    "character_trait_levels_onscreen_name": "trait",
    "technologies_onscreen_name": "tech",
    "rituals_display_name": "ritual",
}

# Longest prefixes first so the most specific table wins (e.g. `battlefield_buildings_names_onscreen_name` before `battlefield_buildings_name`).
_SORTED_PREFIXES: list[tuple[str, str]] = sorted(_NAME_PREFIX_CATEGORIES.items(), key=lambda kv: len(kv[0]), reverse=True)


def classify_name_key(key: str) -> str | None:
    """Return the name category for a WH3 loc key, or None when the key is not a name key.

    Args:
        key: The loc key (e.g. `land_units_onscreen_name_cth_inf_dragon_guard`).

    Returns:
        One of `unit`, `skill`, `building`, `location`, `item`, `trait`, `tech`, `ritual`, or None for descriptions/tooltips/effects/anything else.
    """
    for prefix, category in _SORTED_PREFIXES:
        if key == prefix or key.startswith(prefix + "_"):
            return category
    return None


def is_name_key(key: str) -> bool:
    """Return whether a WH3 loc key is a name key (any category).

    Args:
        key: The loc key to test.

    Returns:
        True when `classify_name_key` returns a category.
    """
    return classify_name_key(key) is not None
