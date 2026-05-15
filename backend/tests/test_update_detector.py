"""Tests for the TW3 mod update detector."""

import os

import pytest

from backend.games.total_war_warhammer_3.update_detector import (
    BaselineEntry,
    StaleMod,
    detect_updates,
)


def test_detect_updates_empty_inputs_returns_empty(tmp_path):
    """Empty inputs produce empty stale list and empty refreshed baseline."""
    stale, refreshed = detect_updates([], {})
    assert stale == []
    assert refreshed == {}


def test_detect_updates_no_baseline_entry_hashes_and_silently_baselines(tmp_path):
    """A mod missing from the baseline is hashed and added to the refreshed baseline. Not stale."""
    pack = tmp_path / "new.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (2000.0, 2000.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]

    stale, refreshed = detect_updates(mods, {})

    assert stale == []
    assert refreshed["m"]["mtime"] == 2000.0
    assert refreshed["m"]["hash"] == "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"


def test_detect_updates_mtime_match_skips_hashing(tmp_path, monkeypatch):
    """When mtime equals baseline, hashing is skipped entirely (cheap path)."""
    pack = tmp_path / "same.pack"
    pack.write_bytes(b"x")
    os.utime(pack, (1000.0, 1000.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    baseline = {"m": {"mtime": 1000.0, "hash": "sha256:abc"}}

    calls = []
    import backend.games.total_war_warhammer_3.update_detector as detector
    monkeypatch.setattr(detector, "_sha256_file", lambda p: calls.append(p) or None)

    stale, refreshed = detect_updates(mods, baseline)

    assert stale == []
    assert calls == []
    assert refreshed == baseline


def test_detect_updates_silent_rebaseline_when_hash_matches(tmp_path):
    """mtime differs but hash equals baseline -> not stale, refreshed baseline carries new mtime."""
    pack = tmp_path / "rebaseline.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (2000.0, 2000.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    baseline = {"m": {"mtime": 1000.0, "hash": "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"}}

    stale, refreshed = detect_updates(mods, baseline)

    assert stale == []
    assert refreshed["m"]["mtime"] == 2000.0
    assert refreshed["m"]["hash"] == baseline["m"]["hash"]


def test_detect_updates_flags_when_hash_differs(tmp_path):
    """Bytes differ -> StaleMod entry. Baseline NOT updated (sync is user's job)."""
    pack = tmp_path / "changed.pack"
    pack.write_bytes(b"new content")
    os.utime(pack, (2000.0, 2000.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]
    baseline = {"m": {"mtime": 1000.0, "hash": "sha256:old_hash_value"}}

    stale, refreshed = detect_updates(mods, baseline)

    assert len(stale) == 1
    entry = stale[0]
    assert entry["package_name"] == "m"
    assert entry["current_mtime"] == 2000.0
    assert entry["baseline_mtime"] == 1000.0
    assert refreshed["m"] == baseline["m"]


def test_detect_updates_skips_unreadable_files(tmp_path):
    """A mod whose path doesn't exist is skipped entirely (not stale, no refresh)."""
    mods = [{"name": "M", "package_name": "m", "path": str(tmp_path / "ghost.pack")}]
    baseline = {"m": {"mtime": 1000.0, "hash": "sha256:abc"}}

    stale, refreshed = detect_updates(mods, baseline)

    assert stale == []
    assert refreshed == baseline


def test_detect_updates_excludes_vanilla(tmp_path):
    """The `vanilla` package is never inspected."""
    mods = [{"name": "Vanilla", "package_name": "vanilla", "path": str(tmp_path / "vanilla.pack")}]
    stale, refreshed = detect_updates(mods, {"vanilla": {"mtime": 0.0, "hash": "sha256:0"}})
    assert stale == []


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# _sha256_file


from backend.games.total_war_warhammer_3.update_detector import _sha256_file


def test_sha256_file_returns_prefixed_hex_for_known_bytes(tmp_path):
    """Hashing a fixture with known bytes returns the expected `sha256:<hex>` string."""
    pack = tmp_path / "known.pack"
    pack.write_bytes(b"hello world")
    # echo -n "hello world" | sha256sum
    expected = "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    assert _sha256_file(str(pack)) == expected


def test_sha256_file_returns_none_for_unreadable_path(tmp_path):
    """A path that does not exist returns `None`, not a raised exception."""
    missing = tmp_path / "does_not_exist.pack"
    assert _sha256_file(str(missing)) is None


def test_sha256_file_handles_large_file_in_chunks(tmp_path):
    """A multi-MB file hashes correctly via the 1 MB chunked read loop."""
    pack = tmp_path / "big.pack"
    # 3 MB of repeating bytes - exercises the chunk loop without being slow.
    pack.write_bytes(b"\xab" * (3 * 1024 * 1024))
    result = _sha256_file(str(pack))
    assert result is not None
    assert result.startswith("sha256:")
    assert len(result) == len("sha256:") + 64


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# current_baseline


from backend.games.total_war_warhammer_3.update_detector import current_baseline


def test_current_baseline_returns_mtime_and_hash_per_mod(tmp_path):
    """Each mod with a readable path gets an entry with `mtime` and a `sha256:` hash."""
    pack = tmp_path / "real.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (1000.0, 1000.0))
    mods = [{"name": "M", "package_name": "m", "path": str(pack)}]

    result = current_baseline(mods)

    assert "m" in result
    assert result["m"]["mtime"] == 1000.0
    assert result["m"]["hash"] == "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"


def test_current_baseline_excludes_vanilla(tmp_path):
    """The `vanilla` package is omitted from the baseline."""
    mods = [{"name": "Vanilla", "package_name": "vanilla", "path": str(tmp_path / "vanilla.pack")}]
    assert current_baseline(mods) == {}


def test_current_baseline_records_none_hash_when_path_unreadable(tmp_path):
    """An unreadable path produces an entry with `mtime: None` and `hash: None`."""
    mods = [{"name": "M", "package_name": "m", "path": str(tmp_path / "missing.pack")}]
    result = current_baseline(mods)
    assert result == {"m": {"mtime": None, "hash": None}}
