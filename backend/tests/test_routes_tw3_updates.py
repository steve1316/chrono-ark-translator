"""Tests for the TW3 mod update detection routes."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.config as config
import backend.games.total_war_warhammer_3.routes.updates as updates_module
from backend.web_server import app

FIXTURES = Path(__file__).parent / "fixtures" / "helper_scripts"


@pytest.fixture(autouse=True, scope="module")
def _reset_tw3_router_cache():
    """Reset the TW3 adapter's class-level router cache before this module runs.

    `TotalWarWarhammer3Adapter._ROUTER` is a lazy singleton built on first property
    access. If another test module has already triggered that build, the cached router
    won't include the updates sub-router this file exercises. Setting it to `None` forces
    a rebuild on next access.
    """
    from backend.games.total_war_warhammer_3.adapter import TotalWarWarhammer3Adapter

    TotalWarWarhammer3Adapter._ROUTER = None
    yield


@pytest.fixture
def baseline_path(tmp_path, monkeypatch):
    """Redirect the storage baseline to a per-test tmp_path.

    Args:
        tmp_path: pytest tmp_path fixture.
        monkeypatch: pytest monkeypatch fixture.

    Returns:
        Path to the redirected baseline file (does not exist yet on creation).
    """
    p = tmp_path / "mod_baseline.json"
    monkeypatch.setattr(updates_module, "_BASELINE_PATH", p)
    return p


@pytest.fixture
def legacy_baseline_path(tmp_path, monkeypatch):
    """Redirect the legacy baseline path to a per-test tmp_path.

    Args:
        tmp_path: pytest tmp_path fixture.
        monkeypatch: pytest monkeypatch fixture.

    Returns:
        Path to the redirected legacy baseline file (does not exist yet on creation).
    """
    p = tmp_path / "mod_mtimes.json"
    monkeypatch.setattr(updates_module, "_LEGACY_BASELINE_PATH", p)
    return p


def test_get_updates_migrates_legacy_flat_baseline(monkeypatch, baseline_path, legacy_baseline_path):
    """When the legacy mod_mtimes.json exists, migrate to mod_baseline.json with hashes and delete the legacy file."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    # Write a legacy flat-mtime baseline.
    legacy_baseline_path.write_text(json.dumps({"some_pkg": 1000.0}), encoding="utf-8")

    res = TestClient(app).get("/api/games/total_war_warhammer_3/updates")

    assert res.status_code == 200
    body = res.json()
    assert body["baseline_exists"] is False
    assert body["stale"] == []
    assert baseline_path.exists()
    # New file has nested {mtime, hash} entries.
    parsed = json.loads(baseline_path.read_text(encoding="utf-8"))
    for entry in parsed.values():
        assert isinstance(entry, dict)
        assert "mtime" in entry
        assert "hash" in entry
    # Legacy file removed.
    assert not legacy_baseline_path.exists()


def test_get_updates_first_run_writes_hashes(monkeypatch, baseline_path):
    """No baseline file -> first-run baseline written with hash strings."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    res = TestClient(app).get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline_exists"] is False
    assert body["stale"] == []
    assert baseline_path.exists()
    parsed = json.loads(baseline_path.read_text(encoding="utf-8"))
    for entry in parsed.values():
        assert entry["hash"] is None or entry["hash"].startswith("sha256:")


def test_get_updates_silent_rebaseline_writes_back(monkeypatch, baseline_path, tmp_path):
    """Touch a fixture file to bump mtime without changing bytes - response stays empty AND the on-disk mtime updates."""
    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    pack = tmp_path / "real.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (1000.0, 1000.0))
    (helper / "supported_mods.py").write_text(f'SUPPORTED_MODS = [\n    {{"name": "M", "package_name": "m", "path": r"{pack}"}},\n]\n')
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(helper))

    # Pre-write the baseline with the CORRECT hash but the OLD mtime.
    baseline_path.write_text(json.dumps({"m": {"mtime": 1000.0, "hash": "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"}}), encoding="utf-8")

    # Touch: bump mtime, same bytes.
    os.utime(pack, (2000.0, 2000.0))

    res = TestClient(app).get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] == []

    refreshed = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert refreshed["m"]["mtime"] == 2000.0
    assert refreshed["m"]["hash"] == "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"


def test_get_updates_flags_when_bytes_change(monkeypatch, baseline_path, tmp_path):
    """Rewrite a fixture file with new bytes - mod appears in stale list, baseline unchanged."""
    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    pack = tmp_path / "changed.pack"
    pack.write_bytes(b"original content")
    os.utime(pack, (1000.0, 1000.0))
    (helper / "supported_mods.py").write_text(f'SUPPORTED_MODS = [\n    {{"name": "M", "package_name": "m", "path": r"{pack}"}},\n]\n')
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(helper))

    baseline_path.write_text(json.dumps({"m": {"mtime": 1000.0, "hash": "sha256:original_placeholder"}}), encoding="utf-8")

    # Rewrite with new content + new mtime.
    pack.write_bytes(b"NEW CONTENT - definitely different")
    os.utime(pack, (2000.0, 2000.0))

    res = TestClient(app).get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert len(body["stale"]) == 1
    assert body["stale"][0]["package_name"] == "m"

    # Baseline must NOT be auto-overwritten; sync is the user's job.
    refreshed = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert refreshed["m"]["hash"] == "sha256:original_placeholder"


def test_post_updates_sync_rehashes_everything(monkeypatch, baseline_path, tmp_path):
    """Sync rewrites the baseline with current mtime+hash for every mod."""
    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    pack = tmp_path / "sync.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (1000.0, 1000.0))
    (helper / "supported_mods.py").write_text(f'SUPPORTED_MODS = [\n    {{"name": "M", "package_name": "m", "path": r"{pack}"}},\n]\n')
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(helper))

    # Pre-write garbage baseline.
    baseline_path.write_text(json.dumps({"m": {"mtime": 0.0, "hash": "sha256:garbage"}}), encoding="utf-8")

    res = TestClient(app).post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 200

    refreshed = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert refreshed["m"]["mtime"] == 1000.0
    assert refreshed["m"]["hash"] == "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"


def test_get_updates_handles_corrupt_baseline_as_first_run(monkeypatch, baseline_path):
    """A corrupt baseline file is treated as first-run: regenerated and `baseline_exists: false` returned."""
    baseline_path.write_text("not json")
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline_exists"] is False
    assert body["stale"] == []


def test_get_updates_returns_503_when_helper_path_unset(monkeypatch, baseline_path):
    """Returns 503 when `TW3_HELPER_PATH` is not configured."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", "")
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 503


def test_post_sync_writes_baseline_with_hash_entries(monkeypatch, baseline_path):
    """POST `/updates/sync` writes a dict with `{mtime, hash}` entries keyed by `package_name`."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 200
    assert baseline_path.exists()
    body = res.json()
    parsed_dt = datetime.fromisoformat(body["synced_at"])
    assert parsed_dt is not None
    assert body["count"] == 2
    data = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    assert "test_mod_a" in data
    assert "test_mod_b" in data
    for entry in data.values():
        assert isinstance(entry, dict)
        assert "mtime" in entry
        assert "hash" in entry


def test_post_sync_prunes_orphans_and_adds_new(monkeypatch, baseline_path):
    """After sync, orphan keys are removed and all fixture mod keys are present."""
    # Pre-populate with one orphan and only one fixture mod (new schema).
    baseline_path.write_text(json.dumps({"orphan_pkg": {"mtime": 999.0, "hash": None}, "test_mod_a": {"mtime": 0.0, "hash": None}}))
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 200
    data = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert "orphan_pkg" not in data
    assert "test_mod_a" in data
    assert "test_mod_b" in data


def test_post_sync_returns_503_when_helper_path_unset(monkeypatch, baseline_path):
    """Returns 503 when `TW3_HELPER_PATH` is not configured."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", "")
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 503


def test_post_sync_then_get_returns_no_stale(monkeypatch, baseline_path):
    """POST sync then GET returns `stale: []` and `baseline_exists: true`."""
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    sync_res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert sync_res.status_code == 200
    get_res = client.get("/api/games/total_war_warhammer_3/updates")
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["stale"] == []
    assert body["baseline_exists"] is True


def test_concurrent_get_updates_do_not_corrupt_baseline(monkeypatch, baseline_path, tmp_path):
    """Two simultaneous GET /updates calls leave the baseline file as valid JSON."""
    import threading as _threading

    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    pack = tmp_path / "concurrent.pack"
    pack.write_bytes(b"hello world")
    os.utime(pack, (1000.0, 1000.0))
    (helper / "supported_mods.py").write_text(f'SUPPORTED_MODS = [\n    {{"name": "M", "package_name": "m", "path": r"{pack}"}},\n]\n')
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(helper))

    client = TestClient(app)
    results = []

    def call():
        res = client.get("/api/games/total_war_warhammer_3/updates")
        results.append(res.status_code)

    threads = [_threading.Thread(target=call) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(s == 200 for s in results)
    # The baseline file must still parse cleanly.
    parsed = json.loads(baseline_path.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict)
