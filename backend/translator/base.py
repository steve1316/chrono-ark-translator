"""
Abstract base class for translation providers.

Defines the interface that all translation backends (Claude, OpenAI,
DeepL, Manual) must implement.
"""

from abc import ABC, abstractmethod
from threading import Event
from typing import Generator


class TranslationProvider(ABC):
    """
    Abstract translation provider interface.

    All providers translate batches of (key, source_text) tuples into
    English and return {key: english_translation} mappings.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of this translation provider.

        Returns:
            str: Display name including any model information.
        """
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
            source_lang: Name of the source language (e.g., `"Chinese"`).
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs for few-shot.
            character_context: Character background info dict with keys like
                `"character_name"`, `"source_game"`, and `"background"`.

        Returns:
            tuple[dict[str, str], list[dict]]: A tuple of (translations dict
                mapping key to English text, suggested_terms list of dicts).
        """
        ...

    @abstractmethod
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
        """Build the system and user prompts without sending to the API.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., `"Chinese"`).
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs
                for few-shot style guidance.
            character_context: Character background info dict with keys like
                `"character_name"`, `"source_game"`, and `"background"`.

        Returns:
            tuple[str, str]: A tuple of (system_prompt, user_message).
                Providers that don't use custom prompts (e.g. `DeepL`) return
                empty strings for both.
        """
        ...

    @property
    def supports_streaming(self) -> bool:
        """Whether this provider supports streaming token-by-token progress."""
        return False

    def translate_batch_stream(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
        cancel_event: Event | None = None,
    ) -> Generator[dict, None, None]:
        """Stream translation progress as a series of event dicts.

        Default implementation calls translate_batch() and yields a single
        `complete` event.  Override in providers that support token streaming.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., `"Chinese"`).
            glossary_prompt: Formatted glossary context for the LLM.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.
            style_examples: Dict of category -> [(source, english)] pairs
                for few-shot style guidance.
            character_context: Character background info dict with keys like
                `"character_name"`, `"source_game"`, and `"background"`.
            cancel_event: When set, the provider should abort the in-progress
                request and close any open HTTP connections (e.g. to Ollama).

        Yields:
            Dicts with a `"type"` key.  Common types: `"started"`,
            `"progress"`, `"complete"`, `"cancelled"`, `"error"`.
            See `OllamaProvider` for the full event schema.
        """
        translations, suggestions = self.translate_batch(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )
        yield {
            "type": "complete",
            "translations": translations,
            "suggestions": suggestions,
        }

    @abstractmethod
    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        """
        Estimate the cost of translating the given entries.

        Args:
            entries: List of (key, source_text) tuples.
            **kwargs: Provider-specific context (`source_lang`, `glossary_prompt`, etc.)

        Returns:
            Dictionary with cost estimation details:
            `{"estimated_tokens": int, "estimated_cost_usd": float, "note": str}`
        """
        ...
