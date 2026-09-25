"""Tests for the Plan 3 translation routes (sync, snapshots, glossary, scan-terms, api-responses)."""

import json
from collections import Counter
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3.api_responses_store import append, list_entries
from backend.games.total_war_warhammer_3.loc_extractor import LocRow
from backend.games.total_war_warhammer_3.routes import translation as routes_module
from backend.games.total_war_warhammer_3.snapshot_store import list_snapshots
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod


@pytest.fixture
def client(monkeypatch, tmp_path: Path) -> TestClient:
    """Build a TestClient with all I/O paths isolated to tmp_path.

    Plan 3 tests actually write `.loc.tsv` files (via sync) and create snapshots that include local source content. The registry's real `local_source_dir`
    points at the user's hand-edited mod folder on the host machine - we MUST not touch that. Override `get_translation_mod` to return a synthetic mod
    whose `local_source_dir` lives under tmp_path.
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
    return TestClient(app)


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group A: POST /clear-translations


def test_clear_translations_wipes_text_and_auto_snapshots(client: TestClient, monkeypatch, tmp_path: Path):
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "Hello", "provider": "manual"}}),
        encoding="utf-8",
    )

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/clear-translations")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cleared"] == 1
    raw = json.loads((mod_dir / "translations.json").read_text(encoding="utf-8"))
    # Clearing writes empty-string overrides (not an empty dict) so the .loc.tsv English is masked, not shown through.
    assert set(raw.keys()) == {"k1"}
    assert raw["k1"]["text"] == ""
    snaps = list_snapshots(mod_id)
    assert len(snaps) == 1
    assert "clear" in snaps[0]["label"].lower()


def test_clear_translations_blanks_english_in_strings_view(client: TestClient, tmp_path: Path):
    """After clearing, the strings view shows empty English for a key whose text lives in the user's .loc.tsv."""
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "Hello", "provider": "manual"}}),
        encoding="utf-8",
    )

    client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/clear-translations")

    rows = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings").json()
    k1 = next(r for r in rows if r["key"] == "k1")
    assert k1["translation_text"] == ""
    assert k1["status"] == "untranslated"


def test_clear_translations_marks_unsynced_so_sync_is_offered(client: TestClient, tmp_path: Path):
    """The empty overrides differ from the still-populated .loc.tsv, so a Sync remains pending."""
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "Hello", "provider": "manual"}}),
        encoding="utf-8",
    )

    client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/clear-translations")

    summary = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/rescan").json()
    assert summary["has_unsynced_changes"] is True


def test_rescan_counts_cleared_keys_as_untranslated(client: TestClient, tmp_path: Path):
    """Rescan's untranslated count honors empty-string overrides so the Translate button stays enabled after a clear.

    The cleared `k1` (empty override masking its `.loc.tsv` text) plus the never-translated `k2` are both untranslated, and the rescan
    count must match the strings view exactly. Without the overlay, rescan would see `k1`'s `.loc.tsv` text and miscount it as translated.
    """
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "Hello", "provider": "manual"}}),
        encoding="utf-8",
    )

    client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/clear-translations")

    summary = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/rescan").json()
    strings = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings?status=untranslated").json()

    assert summary["counts"]["untranslated"] == len(strings)
    assert summary["counts"]["untranslated"] == 2


def test_rescan_emits_canonical_counts_matching_strings_view(client: TestClient, tmp_path: Path):
    """Rescan returns a zero-filled five-state `canonical_counts` dict that tallies the per-row `canonical_status` from the strings view exactly.

    This is the rescan-side mirror of the `canonical_status` field on each strings row. The frontend's status pills read these counts, so they must agree
    with the rows the table shows. The dict always carries all five canonical states (zero-filled) for a stable contract matching Chrono Ark.
    """
    mod_id = "3315737452"
    summary = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/rescan").json()
    rows = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings").json()

    cc = summary["canonical_counts"]
    assert set(cc.keys()) == {"synced", "untouched", "pending", "missing", "untranslatable"}

    tally = Counter(r["canonical_status"] for r in rows)
    for state in cc:
        assert cc[state] == tally.get(state, 0)
    assert sum(cc.values()) == len(rows)


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group B: POST /sync


def test_sync_writes_loc_tsv_and_returns_per_file_counts(client: TestClient, monkeypatch, tmp_path: Path):
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps(
            {
                "k1": {"text": "Hello", "provider": "manual"},
                "k2": {"text": "World", "provider": "claude"},
            }
        ),
        encoding="utf-8",
    )

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/sync")
    assert resp.status_code == 200
    body = resp.json()
    assert "per_file" in body
    snaps = list_snapshots(mod_id)
    assert any("pre-sync" in s["label"].lower() for s in snaps)


def test_strings_hides_orphan_rows(client: TestClient, monkeypatch):
    """A translated key with no matching parent source (orphan) must not appear in the strings table."""

    def trans_with_orphan(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "Existing", True), "gone": LocRow("gone", "Stale", True)}}

    monkeypatch.setattr(routes_module, "_extract_translation_strings", trans_with_orphan)
    resp = client.get("/api/games/total_war_warhammer_3/translation/mods/3315737452/strings")
    assert resp.status_code == 200
    keys = {r["key"] for r in resp.json()}
    assert "gone" not in keys
    assert "k1" in keys


def test_strings_include_previous_text_from_on_disk_loc(client: TestClient, monkeypatch, tmp_path: Path):
    """previous_text is the on-disk .loc.tsv text; when translations.json overrides it, the row shows previous (on-disk) vs current (override)."""
    mod_id = "3315737452"

    def trans_on_disk(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "On Disk EN", True)}}

    monkeypatch.setattr(routes_module, "_extract_translation_strings", trans_on_disk)
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(json.dumps({"k1": {"text": "New Override", "provider": "claude"}}), encoding="utf-8")

    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings")
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["key"] == "k1")
    assert row["translation_text"] == "New Override"
    assert row["previous_text"] == "On Disk EN"


def test_sync_prunes_orphans_from_disk_and_overlay(client: TestClient, monkeypatch, tmp_path: Path):
    """Sync removes orphan rows from the user's .loc.tsv and translations.json, and reports the count."""
    mod_id = "3315737452"
    loc = tmp_path / "translation_mod_source" / "text" / "units.loc.tsv"
    loc.parent.mkdir(parents=True, exist_ok=True)
    loc.write_text("key\ttext\ttooltip\n#Loc;1;text/units.loc\t\t\nk1\tExisting\ttrue\ngone\tStale\ttrue\n", encoding="utf-8")
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "Existing", "provider": "manual"}, "gone": {"text": "Stale", "provider": "manual"}}),
        encoding="utf-8",
    )

    def trans_with_orphan(mod):
        return {"units.loc.tsv": {"k1": LocRow("k1", "Existing", True), "gone": LocRow("gone", "Stale", True)}}

    monkeypatch.setattr(routes_module, "_extract_translation_strings", trans_with_orphan)

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/sync")
    assert resp.status_code == 200
    assert resp.json()["removed_orphans"] == 1
    assert "gone" not in loc.read_text(encoding="utf-8")
    raw = json.loads((mod_dir / "translations.json").read_text(encoding="utf-8"))
    assert "gone" not in raw
    assert "k1" in raw


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group C: snapshot routes (GET/POST/restore/DELETE)


def test_snapshot_routes_round_trip(client: TestClient, tmp_path: Path):
    mod_id = "3315737452"
    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots")
    assert resp.status_code == 200
    assert resp.json() == []

    resp = client.post(
        f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots",
        json={"label": "test snap"},
    )
    assert resp.status_code == 200
    sid = resp.json()["ulid"]

    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots")
    assert resp.status_code == 200
    snaps = resp.json()
    assert len(snaps) == 1 and snaps[0]["ulid"] == sid

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots/{sid}/restore")
    assert resp.status_code == 200
    snaps = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots").json()
    assert len(snaps) == 2

    resp = client.delete(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots/{sid}")
    assert resp.status_code == 200
    snaps = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/snapshots").json()
    assert len(snaps) == 1


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group D: glossary routes


def test_glossary_crud(client: TestClient):
    mod_id = "3315737452"
    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary")
    assert resp.status_code == 200
    assert resp.json() == {}

    resp = client.post(
        f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary",
        json={"english": "Phoenix", "source": "凤", "category": "factions"},
    )
    assert resp.status_code == 200

    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary")
    assert "Phoenix" in resp.json()

    resp = client.put(
        f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary/Phoenix",
        json={"english": "Phoenix Lord", "source": "凤", "category": "factions"},
    )
    assert resp.status_code == 200
    listed = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary").json()
    assert "Phoenix" not in listed and "Phoenix Lord" in listed

    resp = client.delete(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary/Phoenix Lord")
    assert resp.status_code == 200
    assert client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary").json() == {}


def test_glossary_apply_all_renames_existing_translations(client: TestClient, tmp_path: Path):
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(
        json.dumps({"k1": {"text": "The Cathay Phoenix awakens.", "provider": "manual"}}),
        encoding="utf-8",
    )

    resp = client.post(
        f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary/apply-all",
        json={"old_english": "Cathay Phoenix", "new_english": "Cathayan Phoenix"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["replaced"] == 1
    raw = json.loads((mod_dir / "translations.json").read_text(encoding="utf-8"))
    assert "Cathayan Phoenix awakens" in raw["k1"]["text"]


def test_glossary_suggest_edits_logs_to_api_responses(client: TestClient, monkeypatch):
    mod_id = "3315737452"

    def fake_translate_batch(self, entries, source_lang, glossary_prompt, **kwargs):
        return ({k: "x" for k, _ in entries}, [{"english": "Sky", "source": "天", "source_lang": "Chinese", "category": "lore_terms", "reason": "common term"}])

    monkeypatch.setattr("backend.translator.claude_provider.ClaudeProvider.translate_batch", fake_translate_batch)

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/glossary/suggest-edits")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    entries = list_entries(mod_id)
    assert any(e["kind"] == "suggest-edits" for e in entries)


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group E: POST /scan-terms


def test_scan_terms_returns_suggestions_and_logs(client: TestClient, monkeypatch):
    mod_id = "3315737452"

    def fake_translate_batch(self, entries, source_lang, glossary_prompt, **kwargs):
        return ({}, [{"english": "Phoenix", "source": "凤", "source_lang": "Chinese", "category": "factions", "reason": "recurring"}])

    monkeypatch.setattr("backend.translator.claude_provider.ClaudeProvider.translate_batch", fake_translate_batch)

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/scan-terms")
    assert resp.status_code == 200
    suggestions = resp.json()
    assert isinstance(suggestions, list)
    assert len(suggestions) >= 1

    entries = list_entries(mod_id)
    assert any(e["kind"] == "scan-terms" for e in entries)


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group F: GET /api-responses


def test_get_api_responses_returns_logged_entries(client: TestClient):
    mod_id = "3315737452"
    append(
        mod_id,
        {
            "timestamp": "2026-05-25T00:00:00Z",
            "kind": "translate-batch",
            "provider": "claude",
            "model": "claude",
            "input_tokens": None,
            "output_tokens": None,
            "cost_usd": None,
            "keys_or_inputs": ["k1"],
            "raw_response": "{}",
        },
    )

    resp = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/api-responses")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["kind"] == "translate-batch"


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Group H: POST /open-source-file/{filename}


def test_open_source_file_resolves_and_opens(client: TestClient, monkeypatch, tmp_path: Path):
    mod_id = "3315737452"
    loc_file = tmp_path / "translation_mod_source" / "text" / "units.loc.tsv"
    loc_file.write_text("key\ttext\nk1\tHello", encoding="utf-8")
    # Stub out both launch paths so no real application/explorer is spawned, regardless of platform.
    monkeypatch.setattr("os.startfile", lambda p: None, raising=False)
    monkeypatch.setattr(routes_module.subprocess, "Popen", lambda *a, **k: None)

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/open-source-file/units.loc.tsv")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["path"] == str(loc_file)


def test_open_source_file_404_when_missing(client: TestClient):
    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/open-source-file/missing.loc.tsv")
    assert resp.status_code == 404


def test_sync_invokes_pack_build_when_keys_written(client: TestClient, monkeypatch, tmp_path: Path):
    calls = {}
    monkeypatch.setattr(routes_module, "sync_translations_to_loc_tsv", lambda mod, drift: {"/abs/units.loc.tsv": 2})
    # The build is only reached when RPFM + the content dir resolve, so stub both (tests have no real RPFM configured).
    monkeypatch.setattr(routes_module, "resolve_rpfm_cli_path", lambda: Path("/fake/rpfm_cli.exe"))
    monkeypatch.setattr(routes_module, "tw3_workshop_content_dir", lambda mid: tmp_path)
    monkeypatch.setattr(routes_module, "build_translation_pack", lambda mod, **kw: calls.setdefault("built", True))

    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/sync")
    assert resp.status_code == 200
    body = resp.json()
    assert calls.get("built") is True
    assert body["pack_built"] is True
    assert body["pack_error"] is None


def test_sync_skips_pack_build_when_no_keys_written(client: TestClient, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(routes_module, "sync_translations_to_loc_tsv", lambda mod, drift: {})
    # Stub RPFM + content dir so the ONLY thing preventing the build is the empty per_file (proves the guard, not config).
    monkeypatch.setattr(routes_module, "resolve_rpfm_cli_path", lambda: Path("/fake/rpfm_cli.exe"))
    monkeypatch.setattr(routes_module, "tw3_workshop_content_dir", lambda mid: tmp_path)

    def must_not_call(mod, **kw):
        raise AssertionError("build_translation_pack must not run when nothing was written")

    monkeypatch.setattr(routes_module, "build_translation_pack", must_not_call)

    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/sync")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pack_built"] is False
    assert body["pack_error"] is None


def test_sync_reports_pack_error_non_fatally(client: TestClient, monkeypatch, tmp_path: Path):
    from backend.games.total_war_warhammer_3.loc_tsv_packer import PackNotFoundError

    monkeypatch.setattr(routes_module, "sync_translations_to_loc_tsv", lambda mod, drift: {"/abs/units.loc.tsv": 1})
    monkeypatch.setattr(routes_module, "resolve_rpfm_cli_path", lambda: Path("/fake/rpfm_cli.exe"))
    monkeypatch.setattr(routes_module, "tw3_workshop_content_dir", lambda mid: tmp_path)

    def boom(mod, **kw):
        raise PackNotFoundError("no .pack found in X")

    monkeypatch.setattr(routes_module, "build_translation_pack", boom)

    resp = client.post("/api/games/total_war_warhammer_3/translation/mods/3315737452/sync")
    assert resp.status_code == 200
    body = resp.json()
    assert body["pack_built"] is False
    assert "no .pack found" in body["pack_error"]


def test_sync_rebaselines_parent_snapshot_clearing_stale(client: TestClient, tmp_path: Path):
    """Sync re-baselines the parent snapshot to the current parent hashes (Chrono Ark export parity).

    A previously stale row (parent source drifted from the recorded snapshot) whose translation already matches disk shows as pending before sync.
    After sync the snapshot is re-baselined, so the row settles back to synced.
    """
    mod_id = "3315737452"
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    # k1's on-disk translation is "Existing" (fixture). The override matches it, so is_synced is true.
    (mod_dir / "translations.json").write_text(json.dumps({"k1": {"text": "Existing", "provider": "manual"}}), encoding="utf-8")
    # Seed a stale snapshot: the recorded hash for k1 differs from the current parent text hash, so k1 starts as stale -> pending.
    (mod_dir / "parent_snapshot.json").write_text(json.dumps({"units.loc.tsv": {"k1": "0" * 64}}), encoding="utf-8")

    before = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings").json()
    assert next(r for r in before if r["key"] == "k1")["canonical_status"] == "pending"

    resp = client.post(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/sync")
    assert resp.status_code == 200

    after = client.get(f"/api/games/total_war_warhammer_3/translation/mods/{mod_id}/strings").json()
    assert next(r for r in after if r["key"] == "k1")["canonical_status"] == "synced"
