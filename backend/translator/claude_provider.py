"""
Anthropic Claude translation provider.

Translates source language text to English using the Claude API
with glossary enforcement, style examples, and term suggestion.
"""

import json
import time
from typing import Optional
from backend import config
from backend.translator.base import TranslationProvider


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


def build_style_examples_section(examples: dict[str, list[tuple[str, str]]]) -> str:
    """Format style examples as a prompt section for the LLM.

    Builds a Markdown section showing source/English pairs grouped by category
    (`"skills"`, `"buffs"`, `"items"`, `"dialogue"`) so the LLM can match the game's existing
    translation style.

    Args:
        examples: Dict mapping category name (e.g., `"skills"`, `"buffs"`) to a
            list of (source_text, english_text) example pairs.

    Returns:
        str: Formatted Markdown section string, or an empty string if no
            examples are provided.
    """
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
            lines.append(f'- Source: "{source}"')
            lines.append(f'  English: "{english}"')
        lines.append("")

    lines.append("Use this style: imperative for skills, declarative for buffs/items, concise throughout.")
    return "\n".join(lines)


def build_character_context_section(ctx: dict | None) -> str:
    """Format character context as a prompt section for the LLM.

    Builds a Markdown section describing the mod character's background so
    the LLM can use appropriate tone and terminology from the source game.

    Args:
        ctx: Character context dictionary with optional keys
            `"character_name"`, `"source_game"`, and `"background"`. May be None.

    Returns:
        str: Formatted Markdown section string, or an empty string if no
            meaningful context is provided.
    """
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
        """Build the system and user prompts for the Claude API.

        Assembles the full system prompt (with glossary, formatting rules,
        style examples, and character context) and the user message listing
        all entries to translate.

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
            tuple[str, str]: A tuple of (system_prompt, user_message).
        """
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
                    max_tokens=4096,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                raw_text = response.content[0].text
                translations, suggestions = self._parse_response(raw_text, entries)
                # Store raw response for inspection
                self.last_raw_responses = getattr(self, "last_raw_responses", [])
                self.last_raw_responses.append(
                    {
                        "batch_index": len(self.last_raw_responses),
                        "model": self._model,
                        "input_tokens": getattr(response.usage, "input_tokens", None),
                        "output_tokens": getattr(response.usage, "output_tokens", None),
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

    def _parse_response(
        self,
        response_text: str,
        entries: list[tuple[str, str]],
    ) -> tuple[dict[str, str], list[dict]]:
        """Parse the JSON response from Claude.

        Supports both the new format (`{"translations": {...}, "suggested_terms": [...]}`)
        and the legacy flat format (`{"key": "translation", ...}`) for backwards
        compatibility.

        Args:
            response_text: Raw text content from the Claude API response.
            entries: Original list of (key, source_text) tuples, used to
                validate which keys to accept from the response.

        Returns:
            tuple[dict[str, str], list[dict]]: A tuple of (translations dict,
                suggested_terms list). Returns `({}, [])` if parsing fails.
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
                    translations = {k: v.replace("\\n", "\n") for k, v in result["translations"].items() if k in expected_keys and isinstance(v, str)}
                    suggestions = result.get("suggested_terms", [])
                    if not isinstance(suggestions, list):
                        suggestions = []
                    return translations, suggestions

                # Old flat format fallback: {key: translation, ...}
                translations = {k: v.replace("\\n", "\n") for k, v in result.items() if k in expected_keys and isinstance(v, str)}
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
            total_input_tokens += int(cjk_chars * 1.5 + ascii_chars / 4) + 100

            output_chars = sum(len(text) for _, text in batch)
            total_output_tokens += int(output_chars * 1.5) + 200

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
