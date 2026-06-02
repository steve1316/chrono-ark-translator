"""Game-agnostic translation orchestration primitives.

These helpers contain the parts of the batch-translation flow that do not depend
on any game: invoking a translation provider for a single batch and filling in
keys the provider deduplicated. Game-specific concerns (storage, progress,
glossary suggestion handling) stay in each game's route layer.
"""

from __future__ import annotations

import asyncio
from typing import Any


def fill_duplicate_translations(translations: dict[str, str], entries: list[tuple[str, str]]) -> dict[str, str]:
    """Fill missing keys whose source text matches an already-translated entry.

    LLMs often deduplicate identical source strings and only return one key in
    the response. This copies the translation to every other key that shares the
    same source text so nothing is left untranslated.

    Args:
        translations: Mutable dict of key -> target text returned by the provider.
            Modified in-place to include any missing duplicate keys.
        entries: Original (key, source_text) tuples sent to the provider.

    Returns:
        The same `translations` dict, modified in place.
    """
    source_to_translation: dict[str, str] = {}
    for key, source_text in entries:
        if key in translations:
            source_to_translation[source_text] = translations[key]

    for key, source_text in entries:
        if key not in translations and source_text in source_to_translation:
            translations[key] = source_to_translation[source_text]

    return translations


async def run_batch(
    provider: Any,
    entries: list[tuple[str, str]],
    source_lang: str,
    glossary_prompt: str,
    *,
    game_context: str,
    format_rules: list[str],
    style_examples: dict[str, list[tuple[str, str]]],
    character_context: dict[str, str] | None,
    target_lang: str,
) -> tuple[dict[str, str], list[Any]]:
    """Translate one batch via `provider`, off the event loop, filling duplicates.

    Runs the (blocking) provider call in the default executor so the event loop
    stays responsive, then fills any keys the provider deduplicated. Exceptions
    from the provider propagate to the caller.

    Args:
        provider: A translation provider exposing `translate_batch(...)`.
        entries: (key, source_text) tuples to translate.
        source_lang: Source language name (e.g. `"Chinese"`).
        glossary_prompt: Combined base + mod glossary section for the prompt.
        game_context: Game-specific prose context for the prompt.
        format_rules: Per-line format-preservation rules.
        style_examples: Source-language to (input, output) example pairs.
        character_context: Optional character/mod context, or None.
        target_lang: Language being translated into (e.g. `"English"`).

    Returns:
        Tuple of (translations dict keyed by key, suggestion objects).
    """
    loop = asyncio.get_running_loop()
    translations, suggestions = await loop.run_in_executor(
        None,
        lambda: provider.translate_batch(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
            target_lang=target_lang,
        ),
    )
    fill_duplicate_translations(translations, entries)
    return translations, suggestions
