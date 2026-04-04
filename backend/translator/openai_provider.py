"""
OpenAI GPT translation provider.

Translates source language text to English using the OpenAI API
with glossary enforcement, style examples, and term suggestion.
"""

import json
import time
from typing import Optional

import config
from translator.base import TranslationProvider
from translator.claude_provider import _build_style_examples_section, _build_character_context_section


_SYSTEM_PROMPT_TEMPLATE = """You are a professional game translator specializing in translating {source_lang} text into English for the game {game_context}.

## Translation Rules

{format_rules_section}

{style_examples_section}

{glossary_section}

{character_context_section}

## Output Format

Return a valid JSON object with this structure:
```json
{{
  "translations": {{
    "Buff/B_Example_Name": "Example Buff",
    "Buff/B_Example_Description": "Deals &a damage to all enemies."
  }},
  "suggested_terms": [
    {{
      "english": "Term Name",
      "source": "원본 텍스트",
      "source_lang": "{source_lang}",
      "category": "characters|skills|buffs|items|mechanics",
      "reason": "Brief reason why this should be a glossary term"
    }}
  ]
}}
```

Translate ONLY the values. Keys must remain unchanged.

For suggested_terms: identify any recurring proper nouns, character names, skill names, status effects, or game-specific terms that should be added to the glossary for consistency. Only suggest terms that:
- Appear in multiple strings or are clearly important named entities
- Are NOT already in the glossary above
- Are proper nouns, skill/buff/item names, or game mechanics

If no terms to suggest, return an empty array."""


class OpenAIProvider(TranslationProvider):
    """Translation provider using OpenAI's GPT API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o"):
        self._api_key = api_key or config.OPENAI_API_KEY
        self._model = model

    @property
    def name(self) -> str:
        return f"OpenAI ({self._model})"

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
        glossary_section = glossary_prompt if glossary_prompt else "No glossary available."
        rules = format_rules or []
        format_rules_section = "\n".join(
            f"{i+1}. **{rule}**" for i, rule in enumerate(rules)
        ) if rules else ""
        style_examples_section = _build_style_examples_section(style_examples or {})
        character_context_section = _build_character_context_section(character_context)

        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
            source_lang=source_lang,
            game_context=game_context or "a video game",
            format_rules_section=format_rules_section,
            style_examples_section=style_examples_section,
            glossary_section=glossary_section,
            character_context_section=character_context_section,
        )

        user_lines = [f"Translate the following {source_lang} strings to English:\n"]
        for key, source_text in entries:
            escaped = source_text.replace("\n", "\\n")
            user_lines.append(f"**{key}**: {escaped}")
        user_lines.append("\nReturn a JSON object with \"translations\" and \"suggested_terms\".")
        user_message = "\n".join(user_lines)

        return system_prompt, user_message

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
        from openai import OpenAI, RateLimitError, APIError

        if not self._api_key:
            raise ValueError("OpenAI API key not set. Set CATL_OPENAI_API_KEY env var.")

        client = OpenAI(api_key=self._api_key)

        system_prompt, user_message = self.build_prompt(
            entries, source_lang, glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
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
                return self._parse_response(response.choices[0].message.content, entries)

            except RateLimitError:
                wait_time = 2 ** attempt * 5
                print(f"  Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            except APIError as e:
                if attempt == max_retries - 1:
                    print(f"  API error after {max_retries} retries: {e}")
                    return {}, []
                wait_time = 2 ** attempt * 2
                time.sleep(wait_time)

        return {}, []

    def _parse_response(
        self, response_text: str, entries: list[tuple[str, str]],
    ) -> tuple[dict[str, str], list[dict]]:
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

                if "translations" in result and isinstance(result["translations"], dict):
                    translations = {
                        k: v.replace("\\n", "\n") for k, v in result["translations"].items()
                        if k in expected_keys and isinstance(v, str)
                    }
                    suggestions = result.get("suggested_terms", [])
                    if not isinstance(suggestions, list):
                        suggestions = []
                    return translations, suggestions

                translations = {
                    k: v.replace("\\n", "\n") for k, v in result.items()
                    if k in expected_keys and isinstance(v, str)
                }
                return translations, []

        except json.JSONDecodeError:
            print(f"  Warning: Failed to parse LLM response as JSON")

        return {}, []

    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        source_lang = kwargs.get("source_lang", "Korean")
        glossary_prompt = kwargs.get("glossary_prompt", "")
        game_context = kwargs.get("game_context", "")
        format_rules = kwargs.get("format_rules")
        style_examples = kwargs.get("style_examples")
        character_context = kwargs.get("character_context")

        system_prompt, user_message = self.build_prompt(
            entries, source_lang, glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
            character_context=character_context,
        )
        full_prompt = system_prompt + user_message

        # CJK characters tokenize at ~1-2 tokens each, ASCII at ~4 chars/token.
        cjk_chars = sum(1 for c in full_prompt if '\u2e80' <= c <= '\u9fff' or '\uac00' <= c <= '\ud7af' or '\uff00' <= c <= '\uffef')
        ascii_chars = len(full_prompt) - cjk_chars
        estimated_input_tokens = int(cjk_chars * 1.5 + ascii_chars / 4) + 100

        output_chars = sum(len(text) for _, text in entries)
        estimated_output_tokens = int(output_chars * 1.5) + 200

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
            "note": f"Estimated for {len(entries)} strings ({cjk_chars} CJK + {ascii_chars} ASCII chars)",
        }
