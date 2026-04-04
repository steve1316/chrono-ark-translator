import json

from data.character_context import load_character_context, save_character_context


def test_load_returns_empty_defaults_when_no_file(tmp_storage):
    result = load_character_context("12345", storage_path=tmp_storage)
    assert result == {"source_game": "", "character_name": "", "background": ""}


def test_save_and_load_round_trip(tmp_storage):
    ctx = {"source_game": "Library of Ruina", "character_name": "Roland", "background": "A cynical fixer."}
    save_character_context("12345", ctx, storage_path=tmp_storage)
    result = load_character_context("12345", storage_path=tmp_storage)
    assert result == ctx


def test_save_creates_mod_directory(tmp_path):
    ctx = {"source_game": "Blue Archive", "character_name": "Alice", "background": "A student."}
    save_character_context("99999", ctx, storage_path=tmp_path)
    result = load_character_context("99999", storage_path=tmp_path)
    assert result == ctx


def test_load_returns_defaults_for_missing_fields(tmp_storage):
    """If the JSON file only has some fields, missing ones default to empty string."""
    path = tmp_storage / "mods" / "12345" / "character_context.json"
    path.write_text(json.dumps({"source_game": "Limbus Company"}), encoding="utf-8")
    result = load_character_context("12345", storage_path=tmp_storage)
    assert result == {"source_game": "Limbus Company", "character_name": "", "background": ""}
