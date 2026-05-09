"""Tests for the TW3 crashes routes."""

import pytest
from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3 import crash_watcher
from backend.web_server import app


@pytest.fixture(autouse=True, scope="module")
def _reset_tw3_router_cache():
    """The TW3 adapter caches its composed router class-level. Reset so the new
    crashes sub-router is included for the test session."""
    from backend.games.total_war_warhammer_3.adapter import TotalWarWarhammer3Adapter

    TotalWarWarhammer3Adapter._ROUTER = None
    yield


@pytest.fixture
def staged(tmp_path, monkeypatch):
    """Wire APPDATA + TW3_HELPER_PATH so capture_snapshot works against tmp_path."""
    appdata = tmp_path / "appdata"
    wh3 = appdata / "The Creative Assembly" / "Warhammer3"
    (wh3 / "crash_report").mkdir(parents=True)
    (wh3 / "crash_report" / "dump.dmp").write_bytes(b"x" * 100)
    (wh3 / "logs").mkdir(parents=True)
    (wh3 / "logs" / "no_clean_exit").write_text("crashed")
    (wh3 / "preferences.script.txt").write_text("...")
    helper = tmp_path / "totalwar-modding" / "helper_scripts"
    helper.mkdir(parents=True)
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.setattr(crash_watcher.config, "TW3_HELPER_PATH", str(helper))
    return {"appdata": appdata, "helper": helper, "debugging": helper.parent / "debugging"}


def test_get_crashes_returns_empty_list_initially(staged):
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/crashes")
    assert res.status_code == 200
    assert res.json() == {"snapshots": []}


def test_get_crashes_returns_503_when_helper_path_unset(monkeypatch):
    monkeypatch.setattr(crash_watcher.config, "TW3_HELPER_PATH", "")
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/crashes")
    assert res.status_code == 503


def test_post_capture_creates_snapshot(staged):
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/crashes/capture")
    assert res.status_code == 200
    body = res.json()
    assert body["trigger"] == "manual"
    listing = client.get("/api/games/total_war_warhammer_3/crashes").json()
    assert len(listing["snapshots"]) == 1
    assert listing["snapshots"][0]["id"] == body["id"]


def test_put_notes_updates_manifest(staged):
    client = TestClient(app)
    snap = client.post("/api/games/total_war_warhammer_3/crashes/capture").json()
    res = client.put(
        f"/api/games/total_war_warhammer_3/crashes/{snap['id']}/notes",
        json={"notes": "siege battle turn 12"},
    )
    assert res.status_code == 200
    assert res.json()["notes"] == "siege battle turn 12"


def test_put_notes_returns_404_on_unknown(staged):
    client = TestClient(app)
    res = client.put(
        "/api/games/total_war_warhammer_3/crashes/does-not-exist/notes",
        json={"notes": "x"},
    )
    assert res.status_code == 404


def test_delete_crash_removes_folder(staged):
    client = TestClient(app)
    snap = client.post("/api/games/total_war_warhammer_3/crashes/capture").json()
    res = client.delete(f"/api/games/total_war_warhammer_3/crashes/{snap['id']}")
    assert res.status_code == 204
    assert client.get("/api/games/total_war_warhammer_3/crashes").json()["snapshots"] == []


def test_test_fire_writes_marker_when_enabled(staged, monkeypatch):
    monkeypatch.setenv("CATL_TW3_TEST_FIRE_ENABLED", "1")
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/crashes/test-fire")
    assert res.status_code == 202
    marker = staged["appdata"] / "The Creative Assembly" / "Warhammer3" / "logs" / "no_clean_exit"
    assert marker.read_text()


def test_test_fire_returns_404_when_disabled(staged, monkeypatch):
    monkeypatch.delenv("CATL_TW3_TEST_FIRE_ENABLED", raising=False)
    client = TestClient(app)
    res = client.post("/api/games/total_war_warhammer_3/crashes/test-fire")
    assert res.status_code == 404
