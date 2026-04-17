"""
OpenAI GPT translation provider.

Translates source language text to English using the OpenAI API
with glossary enforcement, style examples, and term suggestion.
"""

import time
from typing import Optional
from backend import config
from backend.translator.base import TranslationProvider


OPENAI_MODELS: dict[str, dict] = {
    "gpt-4.1": {"label": "GPT-4.1", "input_per_mtok": 2.0, "output_per_mtok": 8.0},
    "gpt-4.1-mini": {"label": "GPT-4.1 Mini", "input_per_mtok": 0.40, "output_per_mtok": 1.60},
    "gpt-4.1-nano": {"label": "GPT-4.1 Nano", "input_per_mtok": 0.10, "output_per_mtok": 0.40},
    "gpt-5.4": {"label": "GPT-5.4", "input_per_mtok": 2.50, "output_per_mtok": 15.0},
    "gpt-5.4-mini": {"label": "GPT-5.4 Mini", "input_per_mtok": 0.75, "output_per_mtok": 4.50},
    "gpt-5.4-nano": {"label": "GPT-5.4 Nano", "input_per_mtok": 0.20, "output_per_mtok": 1.25},
}

_DEFAULT_PRICING = OPENAI_MODELS["gpt-4.1"]


class OpenAIProvider(TranslationProvider):
    """Translation provider using OpenAI's GPT API.

    Uses OpenAI chat completions to translate game mod text from a source
    language to English, with support for glossary enforcement, style
    examples, character context, and automatic glossary term suggestions.

    Attributes:
        _api_key: OpenAI API key for authentication.
        _model: OpenAI model identifier to use for requests.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        """Initialize the OpenAI translation provider.

        Args:
            api_key: OpenAI API key. Falls back to the value from
                `config.OPENAI_API_KEY` when not provided.
            model: OpenAI model identifier. Falls back to
                `config.OPENAI_MODEL` when not provided.
        """
        self._api_key = api_key or config.OPENAI_API_KEY
        self._model = model or config.OPENAI_MODEL

    @property
    def name(self) -> str:
        return f"OpenAI ({self._model})"

    def translate_batch(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
        character_context: dict | None = None,
        target_lang: str = "English",
    ) -> tuple[dict[str, str], list[dict]]:
        """Translate a batch of strings using the OpenAI API.

        Sends the entries to the OpenAI chat completions endpoint and parses
        the JSON response. Retries automatically on rate-limit and transient
        API errors (up to 3 attempts with exponential backoff).

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
                Returns `({}, [])` on unrecoverable failure.

        Raises:
            ValueError: If no OpenAI API key is configured.
        """
        from openai import OpenAI, RateLimitError, APIError

        if not self._api_key:
            raise ValueError("OpenAI API key not set. Set CATL_OPENAI_API_KEY env var.")

        client = OpenAI(api_key=self._api_key)

        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
            target_lang=target_lang,
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    max_tokens=4096,
                    temperature=0.3,
                )
                raw_text = response.choices[0].message.content
                translations, suggestions = self._parse_response(raw_text, entries)
                # Store raw response for inspection
                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                in_tok = getattr(response.usage, "prompt_tokens", None)
                out_tok = getattr(response.usage, "completion_tokens", None)
                cost_usd = None
                if in_tok is not None and out_tok is not None:
                    pricing = OPENAI_MODELS.get(self._model, _DEFAULT_PRICING)
                    cost_usd = in_tok / 1_000_000 * pricing["input_per_mtok"] + out_tok / 1_000_000 * pricing["output_per_mtok"]
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

            except RateLimitError:
                wait_time = 2**attempt * 5
                print(f"  Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            except APIError as e:
                if attempt == max_retries - 1:
                    print(f"  API error after {max_retries} retries: {e}")
                    return {}, []
                wait_time = 2**attempt * 2
                time.sleep(wait_time)

        return {}, []

    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        """Estimate the cost of translating the given entries with OpenAI.

        Builds the full prompt to get a realistic character count, then
        estimates token counts using heuristic ratios for CJK vs ASCII
        characters. Applies GPT-4o pricing rates.

        Args:
            entries: List of (key, source_text) tuples.
            **kwargs: Provider-specific context including source_lang,
                glossary_prompt, game_context, format_rules,
                style_examples, and character_context.

        Returns:
            dict: Cost estimation with keys `"estimated_input_tokens"`,
                `"estimated_output_tokens"`, `"estimated_cost_usd"`, `"model"`,
                and `"note"`.
        """
        source_lang = kwargs.get("source_lang", "Korean")
        glossary_prompt = kwargs.get("glossary_prompt", "")
        game_context = kwargs.get("game_context", "")
        format_rules = kwargs.get("format_rules")
        style_examples = kwargs.get("style_examples")
        character_context = kwargs.get("character_context")
        target_lang = kwargs.get("target_lang", "English")

        system_prompt, user_message = self.build_prompt(
            entries,
            source_lang,
            glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
            target_lang=target_lang,
        )
        full_prompt = system_prompt + user_message

        # CJK characters tokenize at ~1-2 tokens each, ASCII at ~4 chars/token.
        cjk_chars = sum(1 for c in full_prompt if "\u2e80" <= c <= "\u9fff" or "\uac00" <= c <= "\ud7af" or "\uff00" <= c <= "\uffef")
        ascii_chars = len(full_prompt) - cjk_chars
        estimated_input_tokens = int(cjk_chars * 1.5 + ascii_chars * 0.35) + 300

        output_chars = sum(len(text) for _, text in entries)
        estimated_output_tokens = int(output_chars * 1.5) + 500

        pricing = OPENAI_MODELS.get(self._model, _DEFAULT_PRICING)
        input_cost_per_m = pricing["input_per_mtok"]
        output_cost_per_m = pricing["output_per_mtok"]

        estimated_cost = estimated_input_tokens / 1_000_000 * input_cost_per_m + estimated_output_tokens / 1_000_000 * output_cost_per_m

        return {
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_cost_usd": round(estimated_cost, 4),
            "model": self._model,
            "note": f"Estimated for {len(entries)} strings ({cjk_chars} CJK + {ascii_chars} ASCII chars)",
        }
