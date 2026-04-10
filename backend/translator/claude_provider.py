"""
Anthropic Claude translation provider.

Translates source language text to English using the Claude API
with glossary enforcement, style examples, and term suggestion.
"""

import time
from typing import Optional
from backend import config
from backend.translator.base import TranslationProvider


class ClaudeProvider(TranslationProvider):
    """Translation provider using Anthropic's Claude API.

    Uses Claude to translate game mod text from a source language to English,
    with support for glossary enforcement, style examples, character context,
    and automatic glossary term suggestions.

    Attributes:
        _api_key: Anthropic API key for authentication.
        _model: Claude model identifier to use for requests.
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-20250514"):
        """Initialize the Claude translation provider.

        Args:
            api_key: Anthropic API key. Falls back to the value from
                `config.ANTHROPIC_API_KEY` when not provided.
            model: Claude model identifier (default: `"claude-sonnet-4-20250514"`).
        """
        self._api_key = api_key or config.ANTHROPIC_API_KEY
        self._model = model

    @property
    def name(self) -> str:
        return f"Claude ({self._model})"

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
        """Translate a batch of strings to English using the Claude API.

        Sends the entries to Claude with the assembled prompt and parses the
        JSON response. Retries automatically on rate-limit and transient API
        errors (up to 3 attempts with exponential backoff).

        Args:
            entries: List of (key, source_text) tuples to translate.
            source_lang: Name of the source language (e.g., `"Korean"`).
            glossary_prompt: Pre-formatted glossary section for the prompt.
            game_context: Game title or description for the system prompt.
            format_rules: Formatting preservation rules to include.
            style_examples: Dict of category -> [(source, english)] pairs
                for few-shot style guidance.
            character_context: Character background info dict with keys like
                `"character_name"`, `"source_game"`, and `"background"`.

        Returns:
            tuple[dict[str, str], list[dict]]: A tuple of (translations dict
                mapping key to English text, suggested_terms list of dicts).

        Raises:
            ValueError: If no Anthropic API key is configured.
            RuntimeError: If all retry attempts are exhausted.
        """
        import anthropic

        if not self._api_key:
            raise ValueError("Anthropic API key not set. Set CATL_ANTHROPIC_API_KEY env var.")

        client = anthropic.Anthropic(api_key=self._api_key)

        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.messages.create(
                    model=self._model,
                    max_tokens=16384,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                raw_text = response.content[0].text
                translations, suggestions = self._parse_response(raw_text, entries)
                # Store raw response for inspection
                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                in_tok = getattr(response.usage, "input_tokens", None)
                out_tok = getattr(response.usage, "output_tokens", None)
                cost_usd = None
                if in_tok is not None and out_tok is not None:
                    cost_usd = in_tok / 1_000_000 * 3.0 + out_tok / 1_000_000 * 15.0
                self.last_raw_responses.append(
                    {
                        "batch_index": len(self.last_raw_responses),
                        "model": self._model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                        "cost_usd": cost_usd,
                        "raw_text": raw_text,
                    }
                )
                return translations, suggestions

            except anthropic.RateLimitError:
                wait_time = 2**attempt * 5
                print(f"  Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            except anthropic.APIError as e:
                if attempt == max_retries - 1:
                    raise RuntimeError(f"API error after {max_retries} retries: {e}") from e
                wait_time = 2**attempt * 2
                time.sleep(wait_time)

        raise RuntimeError("Translation failed after all retries")

    def estimate_cost(
        self,
        entries: list[tuple[str, str]],
        source_lang: str = "Korean",
        glossary_prompt: str = "",
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
    ) -> dict:
        """Estimate the cost of translating the given entries with Claude.

        Builds the full prompt to get a realistic character count, then
        estimates token counts using heuristic ratios for CJK vs ASCII
        characters. Applies Claude Sonnet pricing rates.

        Args:
            entries: List of (key, source_text) tuples.
            source_lang: Name of the source language (default: `"Korean"`).
            glossary_prompt: Pre-formatted glossary section for the prompt.
            game_context: Game title or description for the system prompt.
            format_rules: Formatting preservation rules to include.
            style_examples: Dict of category -> [(source, english)] pairs.
            character_context: Character background info dict.

        Returns:
            dict: Cost estimation with keys `"estimated_input_tokens"`,
                `"estimated_output_tokens"`, `"estimated_cost_usd"`, `"model"`,
                and `"note"`.
        """
        from backend import config as _cfg

        batch_size = _cfg.BATCH_SIZE
        num_batches = max(1, (len(entries) + batch_size - 1) // batch_size)

        total_input_tokens = 0
        total_output_tokens = 0
        total_cjk = 0
        total_ascii = 0

        for i in range(0, len(entries), batch_size):
            batch = entries[i : i + batch_size]
            system_prompt, user_message = self.build_prompt(
                batch,
                source_lang,
                glossary_prompt,
                game_context=game_context,
                format_rules=format_rules,
                style_examples=style_examples,
                character_context=character_context,
            )
            full_prompt = system_prompt + user_message

            cjk_chars = sum(1 for c in full_prompt if "\u2e80" <= c <= "\u9fff" or "\uac00" <= c <= "\ud7af" or "\uff00" <= c <= "\uffef")
            ascii_chars = len(full_prompt) - cjk_chars
            total_cjk += cjk_chars
            total_ascii += ascii_chars
            total_input_tokens += int(cjk_chars * 1.5 + ascii_chars * 0.35) + 300

            output_chars = sum(len(text) for _, text in batch)
            total_output_tokens += int(output_chars * 1.5) + 500

        input_cost_per_m = 3.0
        output_cost_per_m = 15.0

        estimated_cost = total_input_tokens / 1_000_000 * input_cost_per_m + total_output_tokens / 1_000_000 * output_cost_per_m

        return {
            "estimated_input_tokens": total_input_tokens,
            "estimated_output_tokens": total_output_tokens,
            "estimated_cost_usd": round(estimated_cost, 4),
            "model": self._model,
            "note": f"Estimated for {len(entries)} strings across {num_batches} batch(es) ({total_cjk} CJK + {total_ascii} ASCII chars)",
        }
