"""Tests for the game-agnostic translation orchestration primitives."""

import asyncio

from backend.translation.orchestrator import fill_duplicate_translations, run_batch


def test_fill_duplicate_translations_copies_to_keys_with_shared_source():
    translations = {"k1": "Hello"}
    entries = [("k1", "원본"), ("k2", "원본"), ("k3", "other")]
    fill_duplicate_translations(translations, entries)
    assert translations == {"k1": "Hello", "k2": "Hello"}


def test_fill_duplicate_translations_returns_the_same_dict():
    translations = {"k1": "Hi"}
    result = fill_duplicate_translations(translations, [("k1", "a")])
    assert result is translations


class _FakeProvider:
    """Minimal provider stub that records its call and returns a fixed result."""

    def __init__(self):
        self.called_with = None

    def translate_batch(self, entries, source_lang, glossary_prompt, *, game_context, format_rules, style_examples, character_context, target_lang):
        self.called_with = {"entries": entries, "source_lang": source_lang, "glossary_prompt": glossary_prompt, "target_lang": target_lang}
        # Simulate the LLM deduplicating identical source text: only k1 returned.
        return {"k1": "Hello"}, [{"english": "Hello"}]


def test_run_batch_invokes_provider_then_fills_duplicates():
    provider = _FakeProvider()
    entries = [("k1", "원본"), ("k2", "원본")]
    translations, suggestions = asyncio.run(
        run_batch(
            provider,
            entries,
            "Chinese",
            "GLOSSARY",
            game_context="CONTEXT",
            format_rules=["rule"],
            style_examples={},
            character_context=None,
            target_lang="English",
        )
    )
    assert translations == {"k1": "Hello", "k2": "Hello"}
    assert suggestions == [{"english": "Hello"}]
    assert provider.called_with["source_lang"] == "Chinese"
    assert provider.called_with["glossary_prompt"] == "GLOSSARY"
    assert provider.called_with["target_lang"] == "English"
