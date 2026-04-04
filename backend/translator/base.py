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
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
    ) -> tuple[dict[str, str], list[dict]]:
        """
        Translate a batch of strings to English.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., "Chinese").
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs for few-shot.

        Returns:
            Tuple of (translations dict, suggested_terms list).
        """
        ...

    def build_prompt(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
    ) -> tuple[str, str]:
        """
        Build the system and user prompts without sending to the API.

        Returns:
            Tuple of (system_prompt, user_message). Providers that don't use
            custom prompts (e.g. DeepL) return empty strings.
        """
        return "", ""

    @abstractmethod
    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        """
        Estimate the cost of translating the given entries.

        Args:
            entries: List of (key, source_text) tuples.
            **kwargs: Provider-specific context (source_lang, glossary_prompt, etc.)

        Returns:
            Dictionary with cost estimation details:
            {"estimated_tokens": int, "estimated_cost_usd": float, "note": str}
        """
        ...
