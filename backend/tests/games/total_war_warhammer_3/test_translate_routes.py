"""Tests for the CA-parity WH3 translate router (preview / batch / cancel).

This router exposes the same `/translate/preview`, `/translate/batch`, and `/translate/cancel` contract as Chrono Ark so the shared `useIterativeTranslation`
hook and `TranslationConfirmModal` drive WH3 translation identically.
"""

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3.loc_extractor import LocRow
from backend.games.total_war_warhammer_3.routes import translate as translate_module
from backend.games.total_war_warhammer_3.routes import translation as routes_module
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod


@pytest.fixture
def client(monkeypatch, tmp_path: Path) -> TestClient:
    """Build a TestClient with all I/O isolated to tmp_path and parent extraction stubbed.

    Mirrors the fixture in `test_translation_routes_v3.py`. `k1` has an existing `.loc.tsv` translation; `k2` is untranslated.
    """
    monkeypatch.setattr("backend.config.STORAGE_PATH", tmp_path, raising=True)

    fake_source = tmp_path / "translation_mod_source"
    (fake_source / "text").mkdir(parents=True, exist_ok=True)
    fake_mod = WH3TranslationMod(
        workshop_id="3315737452",
        display_name="Test Mod",
        parent_workshop_ids=("p",),
        local_source_dir=fake_source,
    )
    monkeypatch.setattr(routes_module, "get_translation_mod", lambda mid: fake_mod if mid == "3315737452" else None)

    def fake_parent(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "原", True), "k2": LocRow("k2", "新", True)}}

    def fake_translation(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "Existing", True)}}

    monkeypatch.setattr(routes_module, "_extract_all_parent_strings", fake_parent)
    monkeypatch.setattr(routes_module, "_extract_translation_strings", fake_translation)

    app = FastAPI()
    app.include_router(routes_module.router, prefix="/api/games/total_war_warhammer_3")
    app.include_router(translate_module.router, prefix="/api/games/total_war_warhammer_3")
    return TestClient(app)


PREFIX = "/api/games/total_war_warhammer_3/translate"


def test_preview_builds_batch_plan_for_untranslated(client: TestClient):
    """Preview returns a flat batch plan plus prompt previews and estimates for the untranslated rows only."""
    resp = client.post(f"{PREFIX}/preview", json={"mod_id": "3315737452"})
    assert resp.status_code == 200
    body = resp.json()
    # Only k2 is untranslated (k1 has existing .loc.tsv text).
    assert body["total_strings"] == 1
    assert body["total_batches"] == 1
    assert body["batch_plan"][0]["keys"] == ["k2"]
    assert body["batch_plan"][0]["source_lang"] == "Chinese"
    assert "Chinese" in body["previews"]
    assert body["previews"]["Chinese"]["strings_in_language"] == 1
    assert "Chinese" in body["estimates"]


def test_preview_returns_zero_when_all_translated(client: TestClient, monkeypatch):
    """Preview reports zero strings when every parent key already has a translation."""

    def all_translated(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "Existing 1", True), "k2": LocRow("k2", "Existing 2", True)}}

    monkeypatch.setattr(routes_module, "_extract_translation_strings", all_translated)
    resp = client.post(f"{PREFIX}/preview", json={"mod_id": "3315737452"})
    assert resp.status_code == 200
    assert resp.json()["total_strings"] == 0


def test_batch_translates_keys_and_persists(client: TestClient, monkeypatch, tmp_path: Path):
    """A batch call translates the given keys via the provider, returns the translations + suggestions, and writes translations.json."""

    def fake_translate_batch(self, entries, source_lang, glossary_prompt, **kwargs):
        return ({"k2": "New Translation"}, [])

    monkeypatch.setattr("backend.translator.claude_provider.ClaudeProvider.translate_batch", fake_translate_batch)

    resp = client.post(
        f"{PREFIX}/batch",
        json={"mod_id": "3315737452", "provider": "claude", "keys": ["k2"], "source_lang": "Chinese", "is_first_batch": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["translations"] == {"k2": "New Translation"}
    assert body["translated"] == 1
    assert body["suggestions"] == []

    raw_path = tmp_path / "games" / "total_war_warhammer_3" / "mods" / "3315737452" / "translations.json"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    assert raw["k2"]["text"] == "New Translation"
    assert raw["k2"]["provider"] == "claude"


def test_batch_rejects_keys_with_no_source_text(client: TestClient):
    """A batch whose keys have no source text returns 400, matching Chrono Ark."""
    resp = client.post(
        f"{PREFIX}/batch",
        json={"mod_id": "3315737452", "provider": "claude", "keys": ["does_not_exist"], "source_lang": "Chinese", "is_first_batch": True},
    )
    assert resp.status_code == 400


def test_cancel_returns_ok(client: TestClient):
    """Cancel is a safe no-op for WH3's non-streaming Claude path and returns a cancelled flag."""
    resp = client.post(f"{PREFIX}/cancel?mod_id=3315737452")
    assert resp.status_code == 200
    assert "cancelled" in resp.json()
