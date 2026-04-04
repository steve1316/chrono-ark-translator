"""
OpenAI GPT translation provider.

Translates source language text to English using the OpenAI API
with glossary enforcement and game-specific style rules.
"""

import json
import time
from typing import Optional

import config
from translator.base import TranslationProvider


# System prompt template for consistent game translation.
# Game context and format rules are injected by the caller from the active GameAdapter.
_SYSTEM_PROMPT_TEMPLATE = """You are a professional game translator specializing in translating {source_lang} text into English for the game {game_context}.

## Translation Rules

{format_rules_section}

{glossary_section}

## Output Format

Return a valid JSON object mapping each key to its English translation. Example:
```json
{{
  "Buff/B_Example_Name": "Example Buff",
  "Buff/B_Example_Description": "Deals &a damage to all enemies."
}}
```

Translate ONLY the values. Keys must remain unchanged."""


class OpenAIProvider(TranslationProvider):
    """Translation provider using OpenAI's GPT API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o"):
        """
        Initialize the OpenAI provider.

        Args:
            api_key: OpenAI API key. Defaults to config value.
            model: GPT model to use.
        """
        self._api_key = api_key or config.OPENAI_API_KEY
        self._model = model

    @property
    def name(self) -> str:
        """Human-readable provider name."""
        return f"OpenAI ({self._model})"

    def translate_batch(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
    ) -> dict[str, str]:
        """
        Translate a batch of strings using OpenAI GPT.

        Args:
            entries: List of (key, source_text) tuples.
            source_lang: Source language name.
            glossary_prompt: Formatted glossary context.
            game_context: Game description for the system prompt.
            format_rules: Game-specific formatting preservation rules.

        Returns:
            Dictionary mapping key to English translation.
        """
        from openai import OpenAI, RateLimitError, APIError

        if not self._api_key:
            raise ValueError(
                "OpenAI API key not set. Set CATL_OPENAI_API_KEY env var."
            )

        client = OpenAI(api_key=self._api_key)

        glossary_section = glossary_prompt if glossary_prompt else "No glossary available."

        # Build numbered format rules section.
        rules = format_rules or []
        format_rules_section = "\n".join(
            f"{i+1}. **{rule}**"
            for i, rule in enumerate(rules)
        ) if rules else ""

        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
            source_lang=source_lang,
            game_context=game_context or "a video game",
            format_rules_section=format_rules_section,
            glossary_section=glossary_section,
        )

        # Build the user message.
        user_lines = [f"Translate the following {source_lang} strings to English:\n"]
        for key, source_text in entries:
            user_lines.append(f"**{key}**: {source_text}")
        user_lines.append(
            "\nReturn a JSON object mapping each key to its English translation."
        )
        user_message = "\n".join(user_lines)

        # Call with retry logic.
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

                response_text = response.choices[0].message.content
                return self._parse_response(response_text, entries)

            except RateLimitError:
                wait_time = 2 ** attempt * 5
                print(f"  Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            except APIError as e:
                if attempt == max_retries - 1:
                    print(f"  API error after {max_retries} retries: {e}")
                    return {}
                wait_time = 2 ** attempt * 2
                time.sleep(wait_time)

        return {}

    def _parse_response(
        self,
        response_text: str,
        entries: list[tuple[str, str]],
    ) -> dict[str, str]:
        """
        Parse the LLM response to extract key→translation mappings.

        Args:
            response_text: Raw LLM response text.
            entries: Original entries for key validation.

        Returns:
            Dictionary mapping key to English translation.
        """
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            result = json.loads(text)
            if isinstance(result, dict):
                expected_keys = {k for k, _ in entries}
                return {
                    k: v for k, v in result.items()
                    if k in expected_keys and isinstance(v, str)
                }
        except json.JSONDecodeError:
            print(f"  Warning: Failed to parse LLM response as JSON")

        return {}

    def estimate_cost(self, entries: list[tuple[str, str]]) -> dict:
        """
        Estimate the cost of translating the given entries.

        Args:
            entries: List of (key, source_text) tuples.

        Returns:
            Cost estimation dictionary.
        """
        total_chars = sum(len(text) for _, text in entries)
        estimated_input_tokens = int(total_chars * 1.5) + 500
        estimated_output_tokens = int(total_chars * 0.8)

        # GPT-4o pricing (approximate per 1M tokens).
        input_cost_per_m = 2.5
        output_cost_per_m = 10.0

        estimated_cost = (
            estimated_input_tokens / 1_000_000 * input_cost_per_m
            + estimated_output_tokens / 1_000_000 * output_cost_per_m
        )

        return {
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_cost_usd": round(estimated_cost, 4),
            "model": self._model,
            "note": f"Estimated for {len(entries)} strings ({total_chars} chars)",
        }
