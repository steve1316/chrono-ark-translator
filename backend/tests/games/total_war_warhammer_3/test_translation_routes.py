"""Tests for WH3 translation routes.

These tests use FastAPI's `TestClient` and a monkeypatched extractor so they
do not require RPFM CLI or local workshop directories.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3.api_responses_store import list_entries
from backend.games.total_war_warhammer_3.loc_extractor import LocRow
from backend.games.total_war_warhammer_3.routes import translation as routes_module
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod
from backend.games.total_war_warhammer_3.translation_store_helpers import (
    load_translations,
    load_translations_raw,
    save_translations_raw,
)


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

    # Default to "no workshop folder on disk" so preview-image tests are deterministic and don't
    # depend on whatever Steam content the dev machine happens to have installed.
    monkeypatch.setattr(routes_module, "_find_parent_preview_image", lambda mod: None)

    app = FastAPI()
    app.include_router(routes_module.router, prefix="/api/games/total_war_warhammer_3")
    return TestClient(app)


def test_list_translation_mods_returns_registry(client: TestClient):
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 5
    assert {m["workshop_id"] for m in data} == {
        "3315737452",
        "3317696617",
        "3392058226",
        "3393724674",
        "3393724734",
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
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/strings?status=untranslated")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["key"] == "k2"
    assert rows[0]["status"] == "untranslated"
    # New: each row now has a `provider` field.
    assert "provider" in rows[0]


def test_get_strings_overlay_from_translations_json(client: TestClient):
    """Verify `get_strings` overlays `translations.json` onto drift rows.

    A key with no `.loc.tsv` translation but a seeded `translations.json` entry should appear as translated with the seeded text and provider.
    """
    now = datetime.now(timezone.utc).isoformat()
    save_translations_raw(
        "3315737452",
        {"k2": {"text": "Seeded", "provider": "claude", "created_at": now, "updated_at": now}},
    )

    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/strings")
    assert resp.status_code == 200
    rows = {r["key"]: r for r in resp.json()}
    assert rows["k2"]["translation_text"] == "Seeded"
    assert rows["k2"]["provider"] == "claude"
    assert rows["k2"]["status"] == "translated"


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
    assert load_translations("3315737452")["k2"] == "New translation"
    raw = load_translations_raw("3315737452")
    assert raw["k2"]["provider"] == "manual"


def test_get_strings_404s_for_unknown_mod(client: TestClient):
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/999/strings")
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


def test_translate_batch_calls_claude_and_saves_results(client: TestClient, monkeypatch):
    """The batch endpoint hands untranslated rows to ClaudeProvider and persists results.

    `ClaudeProvider.translate_batch` takes `entries: list[tuple[str, str]]` and
    builds the system prompt internally - the route should pass game_context,
    format_rules, style_examples, target_lang as separate kwargs.
    """
    calls: dict = {}

    def fake_translate_batch(self, entries, source_lang, glossary_prompt, **kwargs):
        calls["source_lang"] = source_lang
        calls["target_lang"] = kwargs.get("target_lang", "English")
        calls["game_context"] = kwargs.get("game_context", "")
        calls["keys"] = [k for k, _ in entries]
        return ({k: f"EN({v})" for k, v in entries}, [])

    monkeypatch.setattr(
        "backend.translator.claude_provider.ClaudeProvider.translate_batch",
        fake_translate_batch,
    )

    resp = client.post(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/translate",
        json={"keys": ["k2"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["translated"] == 1
    assert calls["source_lang"] == "Chinese"
    assert calls["target_lang"] == "English"
    assert "Warhammer III" in calls["game_context"]
    assert calls["keys"] == ["k2"]

    assert load_translations("3315737452")["k2"] == "EN(新文本)"
    raw = load_translations_raw("3315737452")
    assert raw["k2"]["provider"] == "claude"

    entries = list_entries("3315737452")
    assert len(entries) == 1
    assert entries[0]["kind"] == "translate-batch"
    assert "k2" in entries[0]["keys_or_inputs"]


def test_list_includes_preview_image_url_field(client: TestClient):
    # Default fixture has no workshop folders on disk so preview URLs resolve to None.
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods")
    assert resp.status_code == 200
    data = resp.json()
    for entry in data:
        assert "preview_image_url" in entry
        assert entry["preview_image_url"] is None


def test_rescan_reports_has_unsynced_changes_false_when_translations_match(client: TestClient):
    # Trigger rescan with no translations.json on disk - nothing unsynced.
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    assert resp.status_code == 200
    assert resp.json()["has_unsynced_changes"] is False


def test_rescan_reports_has_unsynced_changes_true_when_translations_diverge(client: TestClient, tmp_path: Path):
    # Seed translations.json with text that does NOT match the fake .loc.tsv for k1.
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / "3315737452"
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(json.dumps({"k1": {"text": "Different text", "provider": "manual"}}), encoding="utf-8")

    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    assert resp.status_code == 200
    assert resp.json()["has_unsynced_changes"] is True


def test_preview_route_404s_when_no_image_on_disk(client: TestClient):
    # Fixture has no workshop folders on disk; preview lookup returns None.
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/preview")
    assert resp.status_code == 404


def test_preview_route_404s_for_unknown_mod(client: TestClient):
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/9999999999/preview")
    assert resp.status_code == 404


def test_open_folder_calls_subprocess(client: TestClient, monkeypatch, tmp_path: Path):
    fake_source = tmp_path / "translation_mod_source"
    fake_source.mkdir(parents=True, exist_ok=True)
    fake_mod = WH3TranslationMod(
        workshop_id="3315737452",
        display_name="Test Mod",
        parent_workshop_ids=("p",),
        local_source_dir=fake_source,
    )
    monkeypatch.setattr(
        "backend.games.total_war_warhammer_3.routes.translation.get_translation_mod",
        lambda mid: fake_mod if mid == "3315737452" else None,
    )

    calls: list[list[str]] = []

    def fake_popen(args, *a, **kw):
        calls.append(list(args))

        class Dummy:
            pass

        return Dummy()

    monkeypatch.setattr("subprocess.Popen", fake_popen)
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/open-folder")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert len(calls) == 1
    assert any(str(fake_source) in arg for arg in calls[0])


def test_open_folder_404s_when_source_dir_missing(client: TestClient, monkeypatch, tmp_path: Path):
    fake_mod = WH3TranslationMod(
        workshop_id="3315737452",
        display_name="x",
        parent_workshop_ids=("p",),
        local_source_dir=tmp_path / "does_not_exist",
    )
    monkeypatch.setattr(
        "backend.games.total_war_warhammer_3.routes.translation.get_translation_mod",
        lambda mid: fake_mod if mid == "3315737452" else None,
    )

    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/open-folder")
    assert resp.status_code == 404


def test_rescan_reports_has_mod_context(client: TestClient, tmp_path: Path):
    # Empty mod-context -> has_mod_context: False.
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    assert resp.status_code == 200
    assert resp.json()["has_mod_context"] is False

    # Save a non-empty mod-context, rescan again -> True.
    client.put(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/mod-context",
        json={"source_game": "", "character_name": "Zerooz", "background": ""},
    )
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/rescan")
    assert resp.status_code == 200
    assert resp.json()["has_mod_context"] is True


def test_mod_context_round_trips_language_overrides(client: TestClient):
    # PUT with both overrides set, then GET round-trips them.
    client.put(
        "/api/games/total_war_warhammer_3/translation/mods/3315737452/mod-context",
        json={
            "source_game": "",
            "character_name": "",
            "background": "",
            "source_language_override": "Japanese",
            "target_language_override": "English",
        },
    )
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/mod-context")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_language_override"] == "Japanese"
    assert body["target_language_override"] == "English"
