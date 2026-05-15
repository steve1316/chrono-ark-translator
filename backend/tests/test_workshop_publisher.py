"""Unit tests for the TW3 SteamCMD workshop_publisher module's pure helpers.

The subprocess-spawning surface (`start_publish`) is not exercised here - that path is covered
by the route-level tests with a monkeypatched `start_publish`, so the test suite never invokes
the real `steamcmd.exe`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3 import workshop_publisher as wp


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# build_vdf


def test_build_vdf_minimal_omits_changenote_when_empty():
    text = wp.build_vdf("1142710", "12345", Path("C:/mods/foo"), "")
    assert '"appid"           "1142710"' in text
    assert '"publishedfileid" "12345"' in text
    assert '"contentfolder"   "C:/mods/foo"' in text
    assert "changenote" not in text


def test_build_vdf_includes_changenote_when_provided():
    text = wp.build_vdf("1142710", "12345", Path("C:/mods/foo"), "fix typo")
    assert '"changenote"      "fix typo"' in text


def test_build_vdf_normalises_backslashes_in_content_folder():
    # Windows paths use backslashes; SteamCMD accepts forward slashes and they sidestep
    # VDF escaping ambiguity, so the publisher converts them.
    text = wp.build_vdf("1142710", "12345", Path("C:\\mods\\foo"), "")
    assert "C:/mods/foo" in text
    assert "C:\\\\mods" not in text


def test_build_vdf_escapes_quotes_in_changenote():
    text = wp.build_vdf("1142710", "12345", Path("C:/mods/foo"), 'release "v2"')
    assert '"changenote"      "release \\"v2\\""' in text


def test_build_vdf_escapes_backslashes_in_changenote():
    text = wp.build_vdf("1142710", "12345", Path("C:/mods/foo"), "path C:\\foo")
    assert '"changenote"      "path C:\\\\foo"' in text


def test_build_vdf_wraps_in_workshopitem_block():
    text = wp.build_vdf("1142710", "12345", Path("C:/mods/foo"), "")
    assert text.startswith('"workshopitem"\n{\n')
    assert text.rstrip().endswith("}")


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# _preflight


def test_preflight_lists_missing_steamcmd_path(tmp_path):
    folder = tmp_path / "mod"
    folder.mkdir()
    with pytest.raises(wp.PublisherPreflightError) as exc_info:
        wp._preflight("", "user", folder)
    assert "steamcmd_path" in exc_info.value.missing


def test_preflight_lists_missing_steam_username(tmp_path):
    folder = tmp_path / "mod"
    folder.mkdir()
    fake_steamcmd = tmp_path / "steamcmd.exe"
    fake_steamcmd.write_text("")
    with pytest.raises(wp.PublisherPreflightError) as exc_info:
        wp._preflight(str(fake_steamcmd), "", folder)
    assert "steam_username" in exc_info.value.missing


def test_preflight_lists_missing_content_folder(tmp_path):
    fake_steamcmd = tmp_path / "steamcmd.exe"
    fake_steamcmd.write_text("")
    missing_folder = tmp_path / "does_not_exist"
    with pytest.raises(wp.PublisherPreflightError) as exc_info:
        wp._preflight(str(fake_steamcmd), "user", missing_folder)
    assert any("content_folder" in m for m in exc_info.value.missing)


def test_preflight_returns_steamcmd_path_when_all_set(tmp_path):
    folder = tmp_path / "mod"
    folder.mkdir()
    fake_steamcmd = tmp_path / "steamcmd.exe"
    fake_steamcmd.write_text("")
    result = wp._preflight(str(fake_steamcmd), "user", folder)
    assert result == fake_steamcmd
