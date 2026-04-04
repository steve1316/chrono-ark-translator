"""
Abstract base class for translation providers.

Defines the interface that all translation backends (Claude, OpenAI,
DeepL, Manual) must implement.
"""

from abc import ABC, abstractmethod


class TranslationProvider(ABC):
    """
    Abstract translation provider interface.

    All providers translate batches of (key, source_text) tuples into
    English and return {key: english_translation} mappings.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of this translation provider."""
        ...

    @abstractmethod
    def translate_batch(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
    ) -> dict[str, str]:
        """
        Translate a batch of strings to English.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., "Chinese").
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt
                (e.g., '"Chrono Ark", a roguelike deck-building RPG').
            format_rules: Game-specific formatting preservation rules
                for the system prompt.

        Returns:
            Dictionary mapping key to English translation.
        """
        ...

    @abstractmethod
    def estimate_cost(self, entries: list[tuple[str, str]]) -> dict:
        """
        Estimate the cost of translating the given entries.

        Args:
            entries: List of (key, source_text) tuples.

        Returns:
            Dictionary with cost estimation details:
            {"estimated_tokens": int, "estimated_cost_usd": float, "note": str}
        """
        ...
