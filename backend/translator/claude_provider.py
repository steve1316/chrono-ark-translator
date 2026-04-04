"""
Anthropic Claude translation provider.

Translates source language text to English using the Claude API
with glossary enforcement, style examples, and term suggestion.
"""

import json
import time
from typing import Optional

import config
from translator.base import TranslationProvider


_SYSTEM_PROMPT_TEMPLATE = """You are a professional game translator specializing in translating {source_lang} text into English for the game {game_context}.

## Translation Rules

{format_rules_section}

{style_examples_section}

{glossary_section}

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


def _build_style_examples_section(examples: dict[str, list[tuple[str, str]]]) -> str:
    """Format style examples as a prompt section."""
    if not examples:
        return ""

    lines = ["## Style Reference", "", "Match the tone and sentence structure of the base game's English translations:", ""]

    category_titles = {
        "skills": "Skill Descriptions",
        "buffs": "Buff/Debuff Descriptions",
        "items": "Item Descriptions",
        "dialogue": "Character Dialogue",
    }

    for category, pairs in examples.items():
        title = category_titles.get(category, category.title())
        lines.append(f"### {title}")
        for source, english in pairs:
            lines.append(f"- Source: \"{source}\"")
            lines.append(f"  English: \"{english}\"")
        lines.append("")

    lines.append("Use this style: imperative for skills, declarative for buffs/items, concise throughout.")
    return "\n".join(lines)


def _build_character_context_section(ctx: dict | None) -> str:
    """Format character context as a prompt section. Returns empty string if no context."""
    if not ctx:
        return ""
    name = ctx.get("character_name", "").strip()
    game = ctx.get("source_game", "").strip()
    background = ctx.get("background", "").strip()
    if not name and not game and not background:
        return ""

    lines = ["## Character Background", ""]
    if name and game:
        lines.append(f"This mod implements **{name}** from **{game}**.")
    elif name:
        lines.append(f"This mod implements **{name}**.")
    elif game:
        lines.append(f"This mod implements a character from **{game}**.")
    if background:
        lines.append("")
        lines.append(background)
    lines.append("")
    lines.append("Use this context to inform your translation choices — match the character's established tone, personality, and terminology from their source game.")
    return "\n".join(lines)


class ClaudeProvider(TranslationProvider):
    """Translation provider using Anthropic's Claude API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-20250514"):
        self._api_key = api_key or config.ANTHROPIC_API_KEY
        self._model = model

    @property
    def name(self) -> str:
        return f"Claude ({self._model})"

    def build_prompt(
        self,
        entries: list[tuple[str, str]],
        source_lang: str,
        glossary_prompt: str,
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
    ) -> tuple[str, str]:
        glossary_section = glossary_prompt if glossary_prompt else "No glossary available."
        rules = format_rules or []
        format_rules_section = "\n".join(
            f"{i+1}. **{rule}**" for i, rule in enumerate(rules)
        ) if rules else ""
        style_examples_section = _build_style_examples_section(style_examples or {})

        system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
            source_lang=source_lang,
            game_context=game_context or "a video game",
            format_rules_section=format_rules_section,
            style_examples_section=style_examples_section,
            glossary_section=glossary_section,
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
    ) -> tuple[dict[str, str], list[dict]]:
        import anthropic

        if not self._api_key:
            raise ValueError("Anthropic API key not set. Set CATL_ANTHROPIC_API_KEY env var.")

        client = anthropic.Anthropic(api_key=self._api_key)

        system_prompt, user_message = self.build_prompt(
            entries, source_lang, glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
        )

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = client.messages.create(
                    model=self._model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                return self._parse_response(response.content[0].text, entries)

            except anthropic.RateLimitError:
                wait_time = 2 ** attempt * 5
                print(f"  Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
            except anthropic.APIError as e:
                if attempt == max_retries - 1:
                    raise RuntimeError(f"API error after {max_retries} retries: {e}") from e
                wait_time = 2 ** attempt * 2
                time.sleep(wait_time)

        raise RuntimeError("Translation failed after all retries")

    def _parse_response(
        self,
        response_text: str,
        entries: list[tuple[str, str]],
    ) -> tuple[dict[str, str], list[dict]]:
        """
        Parse the LLM response. Supports both new format (translations + suggested_terms)
        and old flat format (just key->translation dict) for backwards compatibility.
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

                # New format: {translations: {...}, suggested_terms: [...]}
                if "translations" in result and isinstance(result["translations"], dict):
                    translations = {
                        k: v.replace("\\n", "\n") for k, v in result["translations"].items()
                        if k in expected_keys and isinstance(v, str)
                    }
                    suggestions = result.get("suggested_terms", [])
                    if not isinstance(suggestions, list):
                        suggestions = []
                    return translations, suggestions

                # Old flat format fallback: {key: translation, ...}
                translations = {
                    k: v.replace("\\n", "\n") for k, v in result.items()
                    if k in expected_keys and isinstance(v, str)
                }
                return translations, []

        except json.JSONDecodeError:
            print(f"  Warning: Failed to parse LLM response as JSON")
            print(f"  Response: {text[:200]}...")

        return {}, []

    def estimate_cost(
        self,
        entries: list[tuple[str, str]],
        source_lang: str = "Korean",
        glossary_prompt: str = "",
        game_context: str = "",
        format_rules: list[str] | None = None,
        style_examples: dict[str, list[tuple[str, str]]] | None = None,
    ) -> dict:
        # Build the actual prompt to get a realistic character count
        system_prompt, user_message = self.build_prompt(
            entries, source_lang, glossary_prompt,
            game_context=game_context,
            format_rules=format_rules,
            style_examples=style_examples,
        )
        full_prompt = system_prompt + user_message

        # CJK characters tokenize at ~1-2 tokens each, ASCII at ~4 chars/token.
        # Count them separately for a more accurate estimate.
        cjk_chars = sum(1 for c in full_prompt if '\u2e80' <= c <= '\u9fff' or '\uac00' <= c <= '\ud7af' or '\uff00' <= c <= '\uffef')
        ascii_chars = len(full_prompt) - cjk_chars
        estimated_input_tokens = int(cjk_chars * 1.5 + ascii_chars / 4) + 100

        # Output: translations + JSON overhead + suggested terms
        output_chars = sum(len(text) for _, text in entries)
        estimated_output_tokens = int(output_chars * 1.5) + 200

        input_cost_per_m = 3.0
        output_cost_per_m = 15.0

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
