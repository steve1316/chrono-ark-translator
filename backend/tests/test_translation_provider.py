import json
from backend.translator.claude_provider import ClaudeProvider
from backend.translator.base import build_style_examples_section, build_character_context_section


def test_parse_response_new_format():
    provider = ClaudeProvider.__new__(ClaudeProvider)
    entries = [("Buff/B_Test_Name", "테스트")]
    response = json.dumps(
        {
            "translations": {"Buff/B_Test_Name": "Test"},
            "suggested_terms": [{"english": "Dark Mage", "source": "흑마법사", "source_lang": "Korean", "category": "characters", "reason": "Recurring name"}],
        }
    )
    translations, suggestions = provider._parse_response(response, entries)
    assert translations == {"Buff/B_Test_Name": "Test"}
    assert len(suggestions) == 1
    assert suggestions[0]["english"] == "Dark Mage"


def test_parse_response_old_flat_format_fallback():
    """If the AI returns the old flat format, still parse translations."""
    provider = ClaudeProvider.__new__(ClaudeProvider)
    entries = [("Buff/B_Test_Name", "테스트")]
    response = json.dumps({"Buff/B_Test_Name": "Test"})
    translations, suggestions = provider._parse_response(response, entries)
    assert translations == {"Buff/B_Test_Name": "Test"}
    assert suggestions == []


def test_parse_response_with_markdown_code_block():
    provider = ClaudeProvider.__new__(ClaudeProvider)
    entries = [("Skill/S_1_Name", "스킬")]
    response = '```json\n{"translations": {"Skill/S_1_Name": "Skill"}, "suggested_terms": []}\n```'
    translations, suggestions = provider._parse_response(response, entries)
    assert translations == {"Skill/S_1_Name": "Skill"}


def test_build_style_examples_section():
    examples = {
        "skills": [("적에게 피해를 줍니다.", "Deal damage to an enemy.")],
        "buffs/debuffs": [("공격력 증가", "Attack is increased.")],
    }
    section = build_style_examples_section(examples)
    assert "Deal damage to an enemy." in section
    assert "Attack is increased." in section
    assert "## Style Reference" in section


def test_build_character_context_section_full():
    ctx = {"source_game": "Library of Ruina", "character_name": "Roland", "background": "A cynical fixer."}
    section = build_character_context_section(ctx)
    assert "## Character Background" in section
    assert "**Roland**" in section
    assert "**Library of Ruina**" in section
    assert "A cynical fixer." in section


def test_build_character_context_section_partial_no_game():
    ctx = {"source_game": "", "character_name": "Roland", "background": "A cynical fixer."}
    section = build_character_context_section(ctx)
    assert "## Character Background" in section
    assert "**Roland**" in section
    assert "Library of Ruina" not in section
    assert "A cynical fixer." in section


def test_build_character_context_section_only_background():
    ctx = {"source_game": "", "character_name": "", "background": "A mysterious warrior."}
    section = build_character_context_section(ctx)
    assert "## Character Background" in section
    assert "A mysterious warrior." in section


def test_build_character_context_section_empty():
    ctx = {"source_game": "", "character_name": "", "background": ""}
    section = build_character_context_section(ctx)
    assert section == ""


def test_build_character_context_section_none():
    section = build_character_context_section(None)
    assert section == ""


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Claude model table and request shape


class _Block:
    """Minimal stand-in for an Anthropic content block."""

    def __init__(self, type: str, **fields):
        self.type = type
        for k, v in fields.items():
            setattr(self, k, v)


class _FakeAnthropic:
    """Captures `messages.create` kwargs and returns a canned response."""

    last_kwargs: dict = {}
    content: list = []

    def __init__(self, api_key: str):
        self.messages = self

    def create(self, **kwargs):
        _FakeAnthropic.last_kwargs = kwargs

        class _Usage:
            input_tokens = 100
            output_tokens = 50

        class _Response:
            content = _FakeAnthropic.content
            usage = _Usage()

        return _Response()


def _run_batch(monkeypatch, model: str, content: list) -> tuple[dict, list]:
    """Run `translate_batch` for one entry against the fake client.

    Args:
        monkeypatch: The pytest monkeypatch fixture.
        model: Claude model id to construct the provider with.
        content: Content blocks the fake response returns.

    Returns:
        The `(translations, suggestions)` tuple from `translate_batch`.
    """
    import anthropic

    monkeypatch.setattr(anthropic, "Anthropic", _FakeAnthropic)
    _FakeAnthropic.content = content
    provider = ClaudeProvider(api_key="test-key", model=model)
    return provider.translate_batch([("k1", "테스트")], "Korean", "")


def test_claude_models_lists_current_models_with_pricing():
    from backend.translator.claude_provider import CLAUDE_MODELS

    assert {k: (v["input_per_mtok"], v["output_per_mtok"]) for k, v in CLAUDE_MODELS.items()} == {
        "claude-opus-5-5": (4.0, 20.0),
        "claude-opus-5": (5.0, 25.0),
        "claude-sonnet-5": (2.0, 10.0),
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-haiku-4-5": (1.0, 5.0),
    }


def test_default_pricing_is_sonnet_5():
    from backend.translator.claude_provider import _DEFAULT_PRICING, CLAUDE_MODELS

    assert _DEFAULT_PRICING is CLAUDE_MODELS["claude-sonnet-5"]


def test_translate_batch_reads_the_text_block_after_a_thinking_block(monkeypatch):
    text = json.dumps({"translations": {"k1": "Test"}, "suggested_terms": []})
    translations, _ = _run_batch(monkeypatch, "claude-opus-5-5", [_Block("thinking", thinking=""), _Block("text", text=text)])
    assert translations == {"k1": "Test"}


def test_translate_batch_disables_thinking_for_sonnet_5(monkeypatch):
    text = json.dumps({"translations": {"k1": "Test"}, "suggested_terms": []})
    _run_batch(monkeypatch, "claude-sonnet-5", [_Block("text", text=text)])
    assert _FakeAnthropic.last_kwargs["extra_body"] == {"thinking": {"type": "disabled"}}


def test_translate_batch_uses_low_effort_for_opus_5_models(monkeypatch):
    text = json.dumps({"translations": {"k1": "Test"}, "suggested_terms": []})
    for model in ("claude-opus-5", "claude-opus-5-5"):
        _run_batch(monkeypatch, model, [_Block("text", text=text)])
        assert _FakeAnthropic.last_kwargs["extra_body"] == {"output_config": {"effort": "low"}}


def test_translate_batch_sends_no_extra_options_for_older_models(monkeypatch):
    text = json.dumps({"translations": {"k1": "Test"}, "suggested_terms": []})
    for model in ("claude-sonnet-4-6", "claude-haiku-4-5"):
        _run_batch(monkeypatch, model, [_Block("text", text=text)])
        assert "extra_body" not in _FakeAnthropic.last_kwargs
