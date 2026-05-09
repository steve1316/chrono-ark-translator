"""Tests for the TW3 mod update detection routes."""

from __future__ import annotations

import json
import os
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
    p = tmp_path / "mod_mtimes.json"
    monkeypatch.setattr(updates_module, "_BASELINE_PATH", p)
    return p


def test_get_updates_first_run_creates_baseline_and_returns_empty(monkeypatch, baseline_path):
    """First run writes current mtimes as baseline and returns empty stale list with `baseline_exists: false`.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture.
    """
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline_exists"] is False
    assert body["stale"] == []
    assert baseline_path.exists()


def test_get_updates_returns_stale_mods_when_pack_newer(monkeypatch, tmp_path):
    """Returns 1 stale entry with `delta_seconds > 0` when a pack file is newer than the baseline.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        tmp_path: pytest tmp_path fixture.
    """
    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    pack = tmp_path / "real.pack"
    pack.write_bytes(b"x")
    # utime to a known past value so the baseline can be set even older
    past_mtime = 1000000.0
    os.utime(pack, (past_mtime, past_mtime))

    (helper / "supported_mods.py").write_text(f'SUPPORTED_MODS = [{{"name": "Real Mod", "package_name": "real_mod", "path": "{pack.as_posix()}", "modified_attributes": []}}]')

    # Baseline is older than the pack file
    baseline_file = tmp_path / "mod_mtimes.json"
    baseline_file.write_text(json.dumps({"real_mod": 0.0}))
    monkeypatch.setattr(updates_module, "_BASELINE_PATH", baseline_file)
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(helper))

    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert len(body["stale"]) == 1
    assert body["stale"][0]["delta_seconds"] > 0


def test_get_updates_handles_corrupt_baseline_as_first_run(monkeypatch, baseline_path):
    """A corrupt baseline file is treated as first-run: regenerated and `baseline_exists: false` returned.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture.
    """
    baseline_path.write_text("not json")
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline_exists"] is False
    assert body["stale"] == []


def test_get_updates_returns_503_when_helper_path_unset(monkeypatch, baseline_path):
    """Returns 503 when `TW3_HELPER_PATH` is not configured.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture (defensive redirect).
    """
    monkeypatch.setattr(config, "TW3_HELPER_PATH", "")
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/updates")
    assert res.status_code == 503


def test_post_sync_writes_baseline_atomically(monkeypatch, baseline_path):
    """POST `/updates/sync` writes a flat dict keyed by `package_name` values from the fixture.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture.
    """
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 200
    assert baseline_path.exists()
    data = json.loads(baseline_path.read_text())
    assert isinstance(data, dict)
    assert "test_mod_a" in data
    assert "test_mod_b" in data


def test_post_sync_prunes_orphans_and_adds_new(monkeypatch, baseline_path):
    """After sync, orphan keys are removed and all fixture mod keys are present.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture.
    """
    # Pre-populate with one orphan and only one fixture mod
    baseline_path.write_text(json.dumps({"orphan_pkg": 999.0, "test_mod_a": 0.0}))
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 200
    data = json.loads(baseline_path.read_text())
    assert "orphan_pkg" not in data
    assert "test_mod_a" in data
    assert "test_mod_b" in data


def test_post_sync_returns_503_when_helper_path_unset(monkeypatch, baseline_path):
    """Returns 503 when `TW3_HELPER_PATH` is not configured.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture (defensive redirect).
    """
    monkeypatch.setattr(config, "TW3_HELPER_PATH", "")
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert res.status_code == 503


def test_post_sync_then_get_returns_no_stale(monkeypatch, baseline_path):
    """POST sync then GET returns `stale: []` and `baseline_exists: true`.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        baseline_path: Redirected baseline path fixture.
    """
    monkeypatch.setattr(config, "TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    sync_res = client.post("/api/games/total_war_warhammer_3/updates/sync")
    assert sync_res.status_code == 200
    get_res = client.get("/api/games/total_war_warhammer_3/updates")
    assert get_res.status_code == 200
    body = get_res.json()
    assert body["stale"] == []
    assert body["baseline_exists"] is True
