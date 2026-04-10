import json
from backend.translator.claude_provider import ClaudeProvider, build_style_examples_section, build_character_context_section


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
