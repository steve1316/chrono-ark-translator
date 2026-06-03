"""Tests for the WH3 glossary-suggestion review endpoints (accept / dismiss).

These endpoints back the shared `GlossarySuggestionModal` so WH3's iterative translate loop pauses for glossary review exactly like Chrono Ark.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.data import suggestion_manager
from backend.games.storage_paths import game_storage_path
from backend.games.total_war_warhammer_3 import glossary_store
from backend.games.total_war_warhammer_3.routes import glossary_suggestions as gs_module
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod

GAME_ID = "total_war_warhammer_3"
MOD_ID = "3315737452"

SUGGESTIONS = [
    {"english": "Lord", "source": "卿", "source_lang": "Chinese", "category": "title", "reason": "recurring honorific"},
    {"english": "Cathay", "source": "震旦", "source_lang": "Chinese", "category": "faction", "reason": "place name"},
]


@pytest.fixture
def client(monkeypatch, tmp_path: Path) -> TestClient:
    """TestClient for the no-prefix glossary-suggestions router with all I/O isolated to tmp_path."""
    monkeypatch.setattr("backend.config.STORAGE_PATH", tmp_path, raising=True)
    fake_source = tmp_path / "translation_mod_source"
    (fake_source / "text").mkdir(parents=True, exist_ok=True)
    fake_mod = WH3TranslationMod(workshop_id=MOD_ID, display_name="Test Mod", parent_workshop_ids=("p",), local_source_dir=fake_source)
    monkeypatch.setattr(gs_module, "get_translation_mod", lambda mid: fake_mod if mid == MOD_ID else None)
    app = FastAPI()
    app.include_router(gs_module.router, prefix="/api/games/total_war_warhammer_3")
    return TestClient(app)


def _seed_pending(suggestions: list[dict]) -> None:
    suggestion_manager.save_suggestions(MOD_ID, suggestions, storage_path=game_storage_path(GAME_ID))


def _remaining_terms() -> set[str]:
    return {s["english"] for s in suggestion_manager.load_suggestions(MOD_ID, storage_path=game_storage_path(GAME_ID))}


def test_accept_specific_term_adds_to_glossary_and_removes_pending(client: TestClient):
    _seed_pending(SUGGESTIONS)
    resp = client.post(f"/api/games/total_war_warhammer_3/mods/{MOD_ID}/glossary/suggestions/accept", json={"terms": ["Lord"]})
    assert resp.status_code == 200
    assert resp.json() == {"status": "success", "accepted": 1}
    glossary = glossary_store.load_glossary(MOD_ID)
    assert glossary["Lord"] == {"source": "卿", "category": "title"}
    assert "Cathay" not in glossary
    assert _remaining_terms() == {"Cathay"}


def test_accept_all_adds_every_term_and_clears_pending(client: TestClient):
    _seed_pending(SUGGESTIONS)
    resp = client.post(f"/api/games/total_war_warhammer_3/mods/{MOD_ID}/glossary/suggestions/accept", json={"all": True})
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 2
    assert {"Lord", "Cathay"} <= set(glossary_store.load_glossary(MOD_ID))
    assert _remaining_terms() == set()


def test_dismiss_specific_removes_pending_without_touching_glossary(client: TestClient):
    _seed_pending(SUGGESTIONS)
    resp = client.post(f"/api/games/total_war_warhammer_3/mods/{MOD_ID}/glossary/suggestions/dismiss", json={"terms": ["Lord"]})
    assert resp.status_code == 200
    assert glossary_store.load_glossary(MOD_ID) == {}
    assert _remaining_terms() == {"Cathay"}


def test_dismiss_all_clears_pending(client: TestClient):
    _seed_pending(SUGGESTIONS)
    resp = client.post(f"/api/games/total_war_warhammer_3/mods/{MOD_ID}/glossary/suggestions/dismiss", json={"all": True})
    assert resp.status_code == 200
    assert _remaining_terms() == set()


def test_accept_unknown_mod_returns_404(client: TestClient):
    resp = client.post("/api/games/total_war_warhammer_3/mods/unknown/glossary/suggestions/accept", json={"all": True})
    assert resp.status_code == 404
