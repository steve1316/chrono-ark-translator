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


import subprocess
from unittest.mock import MagicMock

from backend.games.total_war_warhammer_3.loc_extractor import (
    extract_parent_pack_strings,
    normalize_loc_filename,
)


def test_normalize_loc_filename_strips_prefix_and_lowercases():
    assert normalize_loc_filename("@@zerooz_def_units.loc.tsv") == "zerooz_def_units.loc.tsv"
    assert normalize_loc_filename("!!!cth_fuyuanshan.loc.tsv") == "cth_fuyuanshan.loc.tsv"
    assert normalize_loc_filename("ZeroozUnits.loc.tsv") == "zeroozunits.loc.tsv"


def test_extract_parent_pack_strings_invokes_rpfm_cli(monkeypatch, tmp_path: Path):
    """The extractor calls rpfm_cli with the correct arguments."""
    pack = tmp_path / "parent.pack"
    pack.write_bytes(b"PFH5fake")
    cache_dir = tmp_path / "cache"
    rpfm = Path("/fake/rpfm_cli.exe")

    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        # Simulate RPFM writing one extracted loc file.
        out_dir = cache_dir / "extracted"
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "@@zerooz_def_units.loc.tsv").write_text(
            "key\ttext\ttooltip\n" "#Loc;1;text/@@zerooz_def_units.loc\t\t\n" "land_units_onscreen_name_def_inf_x\tFrom parent\ttrue\n",
            encoding="utf-8",
        )
        result = MagicMock()
        result.returncode = 0
        result.stdout = b""
        result.stderr = b""
        return result

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = extract_parent_pack_strings(pack, rpfm, cache_dir)

    assert "rpfm_cli" in str(captured["cmd"][0]).lower() or captured["cmd"][0] == str(rpfm)
    assert "--game" in captured["cmd"] or "-g" in captured["cmd"]
    assert "warhammer_3" in captured["cmd"]
    assert "--tables-as-tsv" in captured["cmd"]
    assert str(pack) in captured["cmd"]
    assert "zerooz_def_units.loc.tsv" in result
    assert result["zerooz_def_units.loc.tsv"]["land_units_onscreen_name_def_inf_x"].text == "From parent"


def test_extract_parent_pack_strings_skips_extraction_when_cache_fresh(monkeypatch, tmp_path: Path):
    """If the cached pack_mtime matches the current pack mtime, no subprocess runs."""
    pack = tmp_path / "parent.pack"
    pack.write_bytes(b"PFH5fake")
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    (cache_dir / "pack_mtime.txt").write_text(str(int(pack.stat().st_mtime)), encoding="utf-8")
    extracted = cache_dir / "extracted"
    extracted.mkdir()
    (extracted / "@@x.loc.tsv").write_text("key\ttext\ttooltip\n#Loc;1;text/x.loc\t\t\nk\tcached\tfalse\n", encoding="utf-8")

    run_mock = MagicMock(side_effect=AssertionError("subprocess.run must not be called when cache is fresh"))
    monkeypatch.setattr(subprocess, "run", run_mock)

    result = extract_parent_pack_strings(pack, Path("/fake/rpfm_cli.exe"), cache_dir)

    run_mock.assert_not_called()
    assert result["x.loc.tsv"]["k"].text == "cached"


def test_extract_parent_pack_strings_raises_on_rpfm_failure(monkeypatch, tmp_path: Path):
    pack = tmp_path / "parent.pack"
    pack.write_bytes(b"PFH5fake")

    def fail(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 2
        result.stdout = b""
        result.stderr = b"RPFM failed"
        return result

    monkeypatch.setattr(subprocess, "run", fail)
    with pytest.raises(RuntimeError, match="RPFM CLI failed"):
        extract_parent_pack_strings(pack, Path("/fake/rpfm_cli.exe"), tmp_path / "cache")
