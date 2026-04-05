"""
DeepL translation provider.

Translates source language text to English using the DeepL API.
Note: DeepL does not support custom system prompts like LLMs do,
so glossary enforcement relies on DeepL's built-in glossary feature.
"""

from typing import Optional
from backend import config
from backend.translator.base import TranslationProvider

# DeepL language code mappings for Chrono Ark source languages.
_DEEPL_LANG_CODES = {
    "Chinese": "ZH",
    "Chinese-TW [zh-tw]": "ZH",
    "Korean": "KO",
    "Japanese": "JA",
}


class DeepLProvider(TranslationProvider):
    """Translation provider using the DeepL API.

    Translates game mod text using DeepL's neural machine translation.
    Does not support custom prompts, glossary enforcement via prompt, or
    glossary term suggestions.

    Attributes:
        _api_key: DeepL API key for authentication.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the DeepL provider.

        Args:
            api_key: DeepL API key. Defaults to config value.
        """
        self._api_key = api_key or config.DEEPL_API_KEY

    @property
    def name(self) -> str:
        """Human-readable provider name."""
        return "DeepL"

    def translate_batch(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
    ) -> tuple[dict[str, str], list[dict]]:
        """Translate a batch of strings using DeepL.

        Note: glossary_prompt, game_context, format_rules, and style_examples
        are ignored since DeepL uses its own glossary system and doesn't
        support custom prompts. DeepL cannot suggest glossary terms.

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., "Korean").
                Mapped to a DeepL language code internally.
            glossary_prompt: Ignored by this provider.
            game_context: Ignored by this provider.
            format_rules: Ignored by this provider.
            style_examples: Ignored by this provider.

        Returns:
            tuple[dict[str, str], list[dict]]: A tuple of (translations dict
                mapping key to English text, empty suggestions list).

        Raises:
            ValueError: If no DeepL API key is configured.
        """
        import deepl

        if not self._api_key:
            raise ValueError(
                "DeepL API key not set. Set CATL_DEEPL_API_KEY env var."
            )

        translator = deepl.Translator(self._api_key)

        # Map source language to DeepL code.
        deepl_source = _DEEPL_LANG_CODES.get(source_lang, "ZH")

        results = {}
        texts = [text for _, text in entries]
        keys = [key for key, _ in entries]

        try:
            # DeepL handles batching natively.
            translations = translator.translate_text(
                texts,
                source_lang=deepl_source,
                target_lang="EN-US",
                preserve_formatting=True,
            )

            for key, translation in zip(keys, translations):
                results[key] = translation.text

        except deepl.DeepLException as e:
            print(f"  DeepL API error: {e}")

        return results, []

    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        """
        Estimate the cost of translating the given entries.

        DeepL charges per character.

        Args:
            entries: List of (key, source_text) tuples.

        Returns:
            Cost estimation dictionary.
        """
        total_chars = sum(len(text) for _, text in entries)

        # DeepL Pro pricing: $25 per 1M characters (approximate).
        estimated_cost = total_chars / 1_000_000 * 25.0

        return {
            "estimated_characters": total_chars,
            "estimated_cost_usd": round(estimated_cost, 4),
            "note": f"Estimated for {len(entries)} strings ({total_chars} chars). "
                    f"DeepL does not support custom glossary prompts — consider "
                    f"creating a DeepL glossary separately for term consistency.",
        }
