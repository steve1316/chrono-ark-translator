"""Tests for the WH3 `.loc.tsv` surgical writeback."""

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.loc_tsv_writeback import (
    apply_row_patches,
    read_loc_tsv_lines,
)


def _write_loc_tsv(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8", newline="")


SAMPLE = (
    "key\ttext\ttooltip\n"
    "#Loc;1;text/sample.loc\t\t\n"
    "key_a\tOld A\ttrue\n"
    "key_b\tOld B\tfalse\n"
)


def test_read_loc_tsv_lines_preserves_header_and_metadata(tmp_path: Path):
    p = tmp_path / "a.loc.tsv"
    _write_loc_tsv(p, SAMPLE)
    lines = read_loc_tsv_lines(p)
    assert lines[0].startswith("key\ttext\ttooltip")
    assert lines[1].startswith("#Loc;1;text/sample.loc")


def test_apply_row_patches_replaces_existing_text(tmp_path: Path):
    p = tmp_path / "a.loc.tsv"
    _write_loc_tsv(p, SAMPLE)
    apply_row_patches(p, {"key_a": "New A"})
    body = p.read_text(encoding="utf-8")
    assert "key_a\tNew A\ttrue" in body
    assert "key_b\tOld B\tfalse" in body  # untouched
    assert "Old A" not in body


def test_apply_row_patches_preserves_other_rows_verbatim(tmp_path: Path):
    p = tmp_path / "a.loc.tsv"
    _write_loc_tsv(p, SAMPLE)
    apply_row_patches(p, {"key_a": "New A"})
    lines = p.read_text(encoding="utf-8").splitlines()
    # Header + metadata + 2 data rows = 4 lines.
    assert len(lines) == 4
    assert lines[0] == "key\ttext\ttooltip"
    assert lines[1] == "#Loc;1;text/sample.loc\t\t"


def test_apply_row_patches_appends_new_keys(tmp_path: Path):
    p = tmp_path / "a.loc.tsv"
    _write_loc_tsv(p, SAMPLE)
    apply_row_patches(p, {"key_c": "Brand new"})
    body = p.read_text(encoding="utf-8")
    assert "key_c\tBrand new\ttrue" in body
    assert "key_a\tOld A\ttrue" in body  # original preserved


def test_apply_row_patches_handles_text_with_tabs_in_old_row(tmp_path: Path):
    """A pathological existing row with embedded literal `\\t` is not corrupted."""
    p = tmp_path / "a.loc.tsv"
    _write_loc_tsv(p, "key\ttext\ttooltip\n#Loc;1;text/x.loc\t\t\nweird\tone\\ttwo\\tthree\ttrue\n")
    apply_row_patches(p, {"weird": "fixed"})
    body = p.read_text(encoding="utf-8")
    # Row replaced; literal column count stays at 3 tab-separated columns.
    rows = [ln for ln in body.splitlines() if ln.startswith("weird\t")]
    assert rows == ["weird\tfixed\ttrue"]


def test_apply_row_patches_creates_file_when_missing(tmp_path: Path):
    p = tmp_path / "new.loc.tsv"
    assert not p.exists()
    apply_row_patches(p, {"key_a": "Hello"})
    body = p.read_text(encoding="utf-8")
    assert body.startswith("key\ttext\ttooltip\n")
    assert "#Loc;1;text/new.loc\t\t" in body
    assert "key_a\tHello\ttrue" in body
