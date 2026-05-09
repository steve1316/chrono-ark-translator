"""Tests for the TW3 mod update detector."""

import os

import pytest

from backend.games.total_war_warhammer_3.update_detector import (
    StaleMod,
    current_mtimes,
    detect_updates,
)


def test_empty_mods_yields_no_stale():
    """Empty inputs produce zero stale entries."""
    assert detect_updates([], {}) == []


def test_no_baseline_entry_yields_no_stale():
    """A mod present in the list but absent from the baseline is not stale."""
    mods = [{"name": "M", "package_name": "m", "path": "/some/path.pack"}]
    assert detect_updates(mods, {}) == []


def test_null_baseline_entry_yields_no_stale():
    """A mod whose baseline value is None is not stale."""
    mods = [{"name": "M", "package_name": "m", "path": "/some/path.pack"}]
    assert detect_updates(mods, {"m": None}) == []


def test_current_equals_baseline_yields_no_stale(tmp_path):
    """A file whose mtime equals the baseline mtime is not stale."""
    pack = tmp_path / "same.pack"
    pack.write_bytes(b"x")
    mtime = 1000.0
    os.utime(pack, (mtime, mtime))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    assert detect_updates(mods, {"m": mtime}) == []


def test_current_older_than_baseline_yields_no_stale(tmp_path):
    """A file whose mtime is older than the baseline is not stale."""
    pack = tmp_path / "older.pack"
    pack.write_bytes(b"x")
    os.utime(pack, (500.0, 500.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    assert detect_updates(mods, {"m": 1000.0}) == []


def test_current_newer_than_baseline_yields_stale(tmp_path):
    """A real file with mtime newer than the baseline produces one stale entry with all fields set."""
    pack = tmp_path / "real.pack"
    pack.write_bytes(b"x")
    baseline_mtime = 1000.0
    current_mtime = 2000.0
    os.utime(pack, (current_mtime, current_mtime))

    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    issues = detect_updates(mods, {"m": baseline_mtime})

    assert len(issues) == 1
    stale = issues[0]
    assert stale["package_name"] == "m"
    assert stale["mod_name"] == "M"
    assert stale["path"] == str(pack)
    assert stale["current_mtime"] == pytest.approx(current_mtime)
    assert stale["baseline_mtime"] == pytest.approx(baseline_mtime)
    assert stale["delta_seconds"] == pytest.approx(1000.0)


def test_unreadable_path_yields_no_stale():
    """A mod whose path does not exist on disk is skipped silently."""
    mods = [{"name": "M", "package_name": "m", "path": "/nonexistent/path.pack"}]
    assert detect_updates(mods, {"m": 1000.0}) == []


def test_mod_missing_path_field_skipped():
    """A mod dict with no `path` key is skipped without raising an exception."""
    mods = [{"name": "M", "package_name": "m"}]
    assert detect_updates(mods, {"m": 1000.0}) == []


def test_mod_missing_package_name_skipped():
    """A mod dict with no `package_name` key is skipped without raising an exception."""
    mods = [{"name": "M", "path": "/some/path.pack"}]
    assert detect_updates(mods, {}) == []


def test_stale_sorted_by_delta_descending(tmp_path):
    """Multiple stale mods are returned sorted by delta_seconds descending."""
    pack_a = tmp_path / "a.pack"
    pack_b = tmp_path / "b.pack"
    pack_a.write_bytes(b"x")
    pack_b.write_bytes(b"x")
    os.utime(pack_a, (1100.0, 1100.0))
    os.utime(pack_b, (1500.0, 1500.0))

    baseline = 1000.0
    mods = [
        {"name": "A", "package_name": "a", "path": str(pack_a)},
        {"name": "B", "package_name": "b", "path": str(pack_b)},
    ]
    issues = detect_updates(mods, {"a": baseline, "b": baseline})

    assert len(issues) == 2
    assert issues[0]["package_name"] == "b"
    assert issues[1]["package_name"] == "a"
    assert issues[0]["delta_seconds"] > issues[1]["delta_seconds"]


def test_current_mtimes_returns_dict_keyed_by_package_name(tmp_path):
    """current_mtimes() returns a dict keyed by package_name with the correct shape."""
    pack = tmp_path / "mod.pack"
    pack.write_bytes(b"x")
    mtime = 1234.0
    os.utime(pack, (mtime, mtime))

    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    result = current_mtimes(mods)

    assert "m" in result
    assert result["m"] == pytest.approx(mtime)


def test_current_mtimes_skips_mods_missing_package_name(tmp_path):
    """current_mtimes() excludes mods that have a `path` but no `package_name`."""
    pack = tmp_path / "mod.pack"
    pack.write_bytes(b"x")
    mods = [{"name": "M", "path": str(pack)}]
    result = current_mtimes(mods)
    assert result == {}


def test_current_mtimes_skips_mods_missing_path():
    """current_mtimes() excludes mods that have a `package_name` but no `path`."""
    mods = [{"name": "M", "package_name": "m"}]
    result = current_mtimes(mods)
    assert result == {}


def test_current_mtimes_returns_none_for_unreadable_paths():
    """current_mtimes() includes the key but maps it to None when the path does not exist."""
    mods = [{"name": "M", "package_name": "m", "path": "/nonexistent/does_not_exist.pack"}]
    result = current_mtimes(mods)
    assert "m" in result
    assert result["m"] is None
