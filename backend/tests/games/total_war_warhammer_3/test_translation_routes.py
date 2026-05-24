"""Tests for WH3 translation routes.

These tests use FastAPI's `TestClient` and a monkeypatched extractor so they
do not require RPFM CLI or local workshop directories.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3.loc_extractor import LocRow
from backend.games.total_war_warhammer_3.routes import translation as routes_module


@pytest.fixture
def client(monkeypatch, tmp_path: Path) -> TestClient:
    # Redirect storage to a per-test tmp dir. `game_storage_path()` reads
    # `config.STORAGE_PATH` at call time, so this patch reroutes every call
    # made through `translation_store_helpers._root()`.
    monkeypatch.setattr("backend.config.STORAGE_PATH", tmp_path, raising=True)

    # Stub the heavy I/O extractors with deterministic data.
    def fake_parent(mod) -> dict[str, dict[str, LocRow]]:
        return {"a.loc.tsv": {"k1": LocRow("k1", "原文", True), "k2": LocRow("k2", "新文本", True)}}

    def fake_translation(mod) -> dict[str, dict[str, LocRow]]:
        return {"a.loc.tsv": {"k1": LocRow("k1", "Old translation", True)}}

    monkeypatch.setattr(routes_module, "_extract_all_parent_strings", fake_parent)
    monkeypatch.setattr(routes_module, "_extract_translation_strings", fake_translation)

    app = FastAPI()
    app.include_router(routes_module.router, prefix="/api/games/total_war_warhammer_3")
    return TestClient(app)


def test_list_translation_mods_returns_registry(client: TestClient):
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 5
    assert {m["workshop_id"] for m in data} == {
        "3315737452", "3317696617", "3392058226", "3393724674", "3393724734",
    }


def test_rescan_returns_drift_summary(client: TestClient):
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    assert resp.status_code == 200
    summary = resp.json()
    # 1 translated (k1), 1 untranslated (k2)
    assert summary["counts"]["translated"] == 1
    assert summary["counts"]["untranslated"] == 1
    assert summary["counts"]["stale"] == 0
    assert summary["counts"]["orphan"] == 0


def test_get_strings_filters_by_status(client: TestClient):
    client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    resp = client.get(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/strings?status=untranslated"
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["key"] == "k2"
    assert rows[0]["status"] == "untranslated"


def test_put_string_persists_translation(client: TestClient):
    client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    resp = client.put(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/strings/k2",
        json={"text": "New translation"},
    )
    assert resp.status_code == 200

    # Translated set should now include k2 after a fresh rescan.
    client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan").json()
    # k2 still untranslated because we save into translations.json which is read by
    # _extract_translation_strings, but the stub ignores that. So just check persistence:
    from backend.games.total_war_warhammer_3.translation_store_helpers import load_translations
    assert load_translations("3315737452")["k2"] == "New translation"


def test_get_strings_404s_for_unknown_mod(client: TestClient):
    resp = client.get(
        "/api/games/total_war_warhammer_3/translation/mods/999/strings"
    )
    assert resp.status_code == 404


def test_mod_context_round_trip(client: TestClient):
    put = client.put(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/mod-context",
        json={"source_game": "WH3", "character_name": "Zerooz Cathy", "background": "Cathay units."},
    )
    assert put.status_code == 200
    got = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/mod-context").json()
    assert got["character_name"] == "Zerooz Cathy"
    assert got["background"] == "Cathay units."
