"""Tests for the WH3 `.loc.tsv` parser."""

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.loc_extractor import LocRow, read_translation_loc_tsv

FIXTURE = Path(__file__).parent / "fixtures" / "sample_translation.loc.tsv"


def test_read_translation_loc_tsv_skips_header_and_metadata():
    """Header row and RPFM `#Loc;1;...` metadata row are not returned as data."""
    rows = read_translation_loc_tsv(FIXTURE)
    assert "key" not in rows
    assert not any(k.startswith("#Loc") for k in rows)


def test_read_translation_loc_tsv_returns_three_data_rows():
    rows = read_translation_loc_tsv(FIXTURE)
    assert len(rows) == 3


def test_read_translation_loc_tsv_parses_text_column():
    rows = read_translation_loc_tsv(FIXTURE)
    row = rows["land_units_onscreen_name_def_inf_daughters_of_khaine"]
    assert row.text == "Daughters of Khaine"


def test_read_translation_loc_tsv_parses_tooltip_as_bool():
    rows = read_translation_loc_tsv(FIXTURE)
    assert rows["land_units_onscreen_name_def_inf_daughters_of_khaine"].tooltip is True
    assert rows["empty_value_test"].tooltip is False


def test_read_translation_loc_tsv_preserves_whitespace_only_text():
    rows = read_translation_loc_tsv(FIXTURE)
    assert rows["empty_value_test"].text == " "


def test_loc_row_is_a_dataclass():
    row = LocRow(key="k", text="t", tooltip=True)
    assert row.key == "k" and row.text == "t" and row.tooltip is True


def test_read_translation_loc_tsv_raises_on_missing_file(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        read_translation_loc_tsv(tmp_path / "does_not_exist.loc.tsv")
