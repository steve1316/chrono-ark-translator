"""
Shared data models for the Chrono Ark Translator.

Contains domain objects used across extractors, translators, and the web UI.
"""

from dataclasses import dataclass, field


@dataclass
class LocString:
    """Represents a single localization entry with all language columns."""

    # Localization key (e.g., "Buff/B_Armor_P_1_Name").
    key: str

    # Entry type (usually "Text").
    type: str

    # Optional description field.
    desc: str

    # Mapping of language name to translated text.
    # E.g. {"Korean": "...", "English": "...", "Chinese": "..."}.
    translations: dict[str, str] = field(default_factory=dict)

    # Which CSV file this entry came from.
    source_file: str = ""
