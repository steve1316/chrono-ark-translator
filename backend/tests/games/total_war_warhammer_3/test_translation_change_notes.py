"""Tests for WH3 translation mod changenotes: the shipped string set, the published baseline, and the note text."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3 import translation_change_notes as tcn
from backend.games.total_war_warhammer_3.loc_extractor import LocRow
from backend.games.total_war_warhammer_3.routes import translation as routes_module
from backend.games.total_war_warhammer_3.translation_drift import DriftRow, hash_text
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod

MOD_ID = "3315737452"


def _row(key: str, text: str | None, status: str = "translated", filename: str = "units.loc.tsv") -> DriftRow:
    """Build a drift row with the fields the shipped set reads."""
    return DriftRow(source_filename=filename, key=key, parent_text="src", translation_text=text, status=status, provider=None)


@pytest.fixture
def storage(monkeypatch, tmp_path: Path) -> Path:
    """Isolate game storage under tmp_path and return the mod's storage folder."""
    monkeypatch.setattr("backend.config.STORAGE_PATH", tmp_path, raising=True)
    return tmp_path / "games" / "total_war_warhammer_3" / "mods" / MOD_ID


@pytest.fixture
def fake_mod(monkeypatch, storage: Path, tmp_path: Path) -> WH3TranslationMod:
    """Register a synthetic mod whose parent has k1 and k2 and whose .loc.tsv translates only k1."""
    mod = WH3TranslationMod(workshop_id=MOD_ID, display_name="Test Mod", parent_workshop_ids=("p",), local_source_dir=tmp_path / "src")
    monkeypatch.setattr(routes_module, "get_translation_mod", lambda mid: mod if mid == MOD_ID else None)
    monkeypatch.setattr(routes_module, "_extract_all_parent_strings", lambda m: {"units.loc.tsv": {"k1": LocRow("k1", "原", True), "k2": LocRow("k2", "新", True)}})
    monkeypatch.setattr(routes_module, "_extract_translation_strings", lambda m: {"units.loc.tsv": {"k1": LocRow("k1", "Existing", True)}})
    return mod


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Shipped set


def test_shipped_strings_hashes_translated_rows_per_file():
    rows = [_row("k1", "One"), _row("k2", "Two", filename="skills.loc.tsv")]

    assert tcn.shipped_strings(rows) == {"units.loc.tsv": {"k1": hash_text("One")}, "skills.loc.tsv": {"k2": hash_text("Two")}}


def test_shipped_strings_skips_orphans_and_empty_text():
    rows = [_row("k1", "One", status="orphan"), _row("k2", ""), _row("k3", None, status="untranslated"), _row("k4", "Four", status="stale")]

    assert tcn.shipped_strings(rows) == {"units.loc.tsv": {"k4": hash_text("Four")}}


def test_current_shipped_strings_applies_translations_json(fake_mod, storage: Path):
    storage.mkdir(parents=True)
    (storage / "translations.json").write_text(json.dumps({"k2": {"text": "New", "provider": "claude"}}), encoding="utf-8")

    assert routes_module.current_shipped_strings(MOD_ID) == {"units.loc.tsv": {"k1": hash_text("Existing"), "k2": hash_text("New")}}


def test_current_shipped_strings_leaves_out_cleared_overrides(fake_mod, storage: Path):
    storage.mkdir(parents=True)
    (storage / "translations.json").write_text(json.dumps({"k1": {"text": "", "provider": "manual"}}), encoding="utf-8")

    assert routes_module.current_shipped_strings(MOD_ID) == {}


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Baseline


def test_baseline_round_trips_and_lives_outside_snapshots(storage: Path):
    strings = {"units.loc.tsv": {"k1": "h1"}}

    tcn.save_baseline(MOD_ID, strings, "[u]Translation update[/u]")

    loaded = tcn.load_baseline(MOD_ID)
    assert loaded["strings"] == strings
    assert loaded["changenote"] == "[u]Translation update[/u]"
    assert loaded["published_at"]
    assert (storage / "published_baseline.json").is_file()
    assert not (storage / "published_baseline.json.tmp").exists()


def test_load_baseline_is_none_when_missing_or_corrupt(storage: Path):
    assert tcn.load_baseline(MOD_ID) is None
    storage.mkdir(parents=True)
    (storage / "published_baseline.json").write_text("{not json", encoding="utf-8")
    assert tcn.load_baseline(MOD_ID) is None


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Note text


def test_diff_counts_new_revised_and_removed_by_file_and_key():
    baseline = {"a.loc.tsv": {"k1": "h1", "k2": "h2", "gone": "h"}, "b.loc.tsv": {"k1": "h1"}}
    shipped = {"a.loc.tsv": {"k1": "h1", "k2": "changed", "k3": "h3"}, "b.loc.tsv": {"k1": "h1", "k9": "h9"}}

    assert tcn.diff_counts(baseline, shipped) == (2, 1, 1)


def test_build_note_without_a_baseline_is_generic_and_pending():
    assert tcn.build_note(None, {"a": {"k": "h"}}) == ("[u]Translation update[/u]", True)


def test_build_note_with_no_changes_is_generic_and_not_pending():
    shipped = {"a": {"k": "h"}}

    assert tcn.build_note({"strings": shipped}, shipped) == ("[u]Translation update[/u]", False)


def test_build_note_lists_only_non_zero_counts_in_order():
    baseline = {"strings": {"a": {"k1": "h1", "k2": "h2", "k3": "h3", "old": "h"}}}
    shipped = {"a": {"k1": "h1", "k2": "x", "k3": "y", "n1": "h", "n2": "h"}}

    note, pending = tcn.build_note(baseline, shipped)

    assert pending is True
    assert note == "[u]Translation update[/u]\n\n• Translated 2 new strings\n• Revised 2 translations\n• Removed 1 string no longer in the parent mod"


def test_build_note_uses_singular_nouns_for_one():
    note, _ = tcn.build_note({"strings": {"a": {"k1": "h1"}}}, {"a": {"k1": "x", "k2": "h"}})

    assert note == "[u]Translation update[/u]\n\n• Translated 1 new string\n• Revised 1 translation"
