"""
Shared data models for the Chrono Ark Translator.

Contains domain objects used across extractors, translators, and the web UI.
"""

from dataclasses import dataclass, field


@dataclass
class LocString:
    """Represents a single localization entry with all language columns.

    Attributes:
        key: Localization key (e.g., `"Buff/B_Armor_P_1_Name"`).
        type: Entry type (usually `"Text"`).
        desc: Optional description field.
        translations: Mapping of language name to translated text.
            E.g. `{"Korean": "...", "English": "...", "Chinese": "..."}`.
        source_file: Which CSV file this entry came from.
    """

    key: str
    type: str
    desc: str
    translations: dict[str, str] = field(default_factory=dict)
    source_file: str = ""
