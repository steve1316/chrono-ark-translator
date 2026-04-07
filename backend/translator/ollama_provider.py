"""
Ollama local LLM translation provider.

Translates source language text to English using a locally-running Ollama
instance via its OpenAI-compatible API endpoint. No API key or cost.
"""

import json
import time
from typing import Optional
from backend import config
from backend.translator.base import TranslationProvider
from backend.translator.claude_provider import build_style_examples_section, build_character_context_section


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


class OllamaProvider(TranslationProvider):
    """Translation provider using a local Ollama instance.

    Uses Ollama's OpenAI-compatible API to translate game mod text from a
    source language to English. Supports glossary enforcement, style
    examples, character context, and automatic glossary term suggestions.

    Attributes:
        _base_url: Ollama server base URL.
        _model: Ollama model name to use for requests.
    """

    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self._base_url = base_url or config.OLLAMA_BASE_URL
        self._model = model or config.OLLAMA_MODEL

    @property
    def name(self) -> str:
        return f"Ollama ({self._model})"

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
        format_rules_section = "\n".join(f"{i+1}. **{rule}**" for i, rule in enumerate(rules)) if rules else ""
        style_examples_section = build_style_examples_section(style_examples or {})
        character_context_section = build_character_context_section(character_context)

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
        user_lines.append('\nReturn a JSON object with "translations" and "suggested_terms".')
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
        from openai import OpenAI, APIError

        client = OpenAI(base_url=f"{self._base_url}/v1", api_key="ollama")

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
                response = client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    max_tokens=8192,
                    temperature=0.3,
                )
                raw_text = response.choices[0].message.content
                translations, suggestions = self._parse_response(raw_text, entries)
                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                in_tok = getattr(response.usage, "prompt_tokens", None)
                out_tok = getattr(response.usage, "completion_tokens", None)
                self.last_raw_responses.append(
                    {
                        "batch_index": len(self.last_raw_responses),
                        "model": self._model,
                        "input_tokens": in_tok,
                        "output_tokens": out_tok,
                        "cost_usd": 0.0,
                        "raw_text": raw_text,
                    }
                )
                return translations, suggestions

            except ConnectionError:
                raise RuntimeError(
                    f"Cannot connect to Ollama at {self._base_url}. Is Ollama running?"
                )
            except APIError as e:
                if attempt == max_retries - 1:
                    print(f"  Ollama API error after {max_retries} retries: {e}")
                    return {}, []
                wait_time = 2**attempt * 2
                time.sleep(wait_time)

        return {}, []

    def _parse_response(
        self,
        response_text: str,
        entries: list[tuple[str, str]],
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
                    translations = {k: v.replace("\\n", "\n") for k, v in result["translations"].items() if k in expected_keys and isinstance(v, str)}
                    suggestions = result.get("suggested_terms", [])
                    if not isinstance(suggestions, list):
                        suggestions = []
                    return translations, suggestions

                translations = {k: v.replace("\\n", "\n") for k, v in result.items() if k in expected_keys and isinstance(v, str)}
                return translations, []

        except json.JSONDecodeError:
            print(f"  Warning: Failed to parse Ollama response as JSON")
            print(f"  Response: {text[:200]}...")

        return {}, []

    def estimate_cost(self, entries: list[tuple[str, str]], **kwargs) -> dict:
        source_lang = kwargs.get("source_lang", "Korean")
        glossary_prompt = kwargs.get("glossary_prompt", "")
        game_context = kwargs.get("game_context", "")
        format_rules = kwargs.get("format_rules")
        style_examples = kwargs.get("style_examples")
        character_context = kwargs.get("character_context")

        system_prompt, user_message = self.build_prompt(
            entries,
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
        estimated_input_tokens = int(cjk_chars * 1.5 + ascii_chars / 4) + 100

        output_chars = sum(len(text) for _, text in entries)
        estimated_output_tokens = int(output_chars * 1.5) + 200

        return {
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_cost_usd": 0.0,
            "model": self._model,
            "note": f"Ollama local inference — no API cost ({len(entries)} strings, ~{estimated_input_tokens + estimated_output_tokens} tokens)",
        }
