"""Tests for the TW3 crash watcher."""

import json
import threading
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.games.total_war_warhammer_3.crash_watcher import (
    SnapshotNotFoundError,
    WatcherDisabledError,
    capture_snapshot,
    delete_snapshot,
    list_snapshots,
    update_notes,
)


def _stage_appdata(tmp_path: Path) -> Path:
    """Build a fake APPDATA tree with the three artifact sources populated."""
    appdata = tmp_path / "appdata"
    wh3 = appdata / "The Creative Assembly" / "Warhammer3"
    (wh3 / "crash_report").mkdir(parents=True)
    (wh3 / "crash_report" / "dump.dmp").write_bytes(b"x" * 4096)
    (wh3 / "logs").mkdir(parents=True)
    (wh3 / "logs" / "no_clean_exit").write_text("crashed")
    (wh3 / "logs" / "battle_log.txt").write_text("...")
    (wh3 / "preferences.script.txt").write_text("mod_load_order = []\n")
    return appdata


def _stage_helper(tmp_path: Path) -> Path:
    """Build a fake helper_scripts tree so debugging/ is rooted alongside it."""
    helper = tmp_path / "totalwar-modding" / "helper_scripts"
    helper.mkdir(parents=True)
    return helper


@pytest.fixture
def staged(tmp_path, monkeypatch):
    """Wire APPDATA + TW3_HELPER_PATH into the test fixtures."""
    appdata = _stage_appdata(tmp_path)
    helper = _stage_helper(tmp_path)
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.setattr(
        "backend.games.total_war_warhammer_3.crash_watcher.config.TW3_HELPER_PATH",
        str(helper),
    )
    return {"appdata": appdata, "helper": helper, "debugging": helper.parent / "debugging"}


def test_capture_snapshot_copies_all_three_artifacts(staged):
    manifest = capture_snapshot(trigger="manual")
    folder = staged["debugging"] / manifest["id"]
    assert (folder / "crash_report" / "dump.dmp").read_bytes() == b"x" * 4096
    assert (folder / "logs" / "no_clean_exit").read_text() == "crashed"
    assert (folder / "preferences.script.txt").read_text() == "mod_load_order = []\n"
    assert (folder / "snapshot.json").is_file()


def test_capture_snapshot_manifest_shape(staged):
    manifest = capture_snapshot(trigger="watcher")
    assert manifest["trigger"] == "watcher"
    assert manifest["notes"] == ""
    assert manifest["files"]["crash_report"]["present"] is True
    assert manifest["files"]["crash_report"]["file_count"] == 1
    assert manifest["files"]["crash_report"]["total_bytes"] == 4096
    assert manifest["files"]["preferences.script.txt"]["present"] is True


def test_capture_snapshot_handles_missing_crash_report(staged):
    # Remove crash_report/ so the source path does not exist.
    import shutil

    shutil.rmtree(staged["appdata"] / "The Creative Assembly" / "Warhammer3" / "crash_report")
    manifest = capture_snapshot(trigger="manual")
    assert manifest["files"]["crash_report"]["present"] is False
    assert manifest["files"]["logs"]["present"] is True


def test_capture_snapshot_appends_suffix_on_collision(staged, monkeypatch):
    # Force two captures to compute the same folder name.
    from datetime import datetime, timezone

    fixed = datetime(2026, 5, 9, 20, 30, 45, tzinfo=timezone.utc)

    class _FixedDT:
        @classmethod
        def now(cls, tz=None):
            return fixed

    monkeypatch.setattr("backend.games.total_war_warhammer_3.crash_watcher.datetime", _FixedDT)

    a = capture_snapshot()
    b = capture_snapshot()
    assert a["id"] == "2026-05-09-203045"
    assert b["id"] == "2026-05-09-203045-2"


def test_capture_snapshot_raises_when_helper_path_unset(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path / "appdata"))
    monkeypatch.setattr(
        "backend.games.total_war_warhammer_3.crash_watcher.config.TW3_HELPER_PATH",
        "",
    )
    with pytest.raises(WatcherDisabledError):
        capture_snapshot()


def test_concurrent_captures_serialize(staged):
    """Two threads racing capture_snapshot should both succeed without overlap."""
    results = []
    barrier = threading.Barrier(2)

    def run():
        barrier.wait()
        results.append(capture_snapshot())

    threads = [threading.Thread(target=run) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(results) == 2
    ids = {r["id"] for r in results}
    assert len(ids) == 2  # different folder names due to suffix logic


def test_update_notes_round_trip(staged):
    snap = capture_snapshot()
    updated = update_notes(snap["id"], "siege battle turn 12")
    assert updated["notes"] == "siege battle turn 12"
    # Verify persistence: re-listing reads the manifest fresh from disk.
    snapshots = list_snapshots()
    matching = [s for s in snapshots if s["id"] == snap["id"]]
    assert matching[0]["notes"] == "siege battle turn 12"


def test_update_notes_raises_on_missing_id(staged):
    with pytest.raises(SnapshotNotFoundError):
        update_notes("does-not-exist", "x")


def test_delete_snapshot_removes_folder(staged):
    snap = capture_snapshot()
    delete_snapshot(snap["id"])
    assert list_snapshots() == []
    assert not (staged["debugging"] / snap["id"]).exists()


def test_delete_snapshot_raises_on_missing_id(staged):
    with pytest.raises(SnapshotNotFoundError):
        delete_snapshot("does-not-exist")
