"""Tests for the TW3 packs preview route and helpers."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend import config
from backend.games.total_war_warhammer_3.routes._paths import tw3_workshop_content_dir
from backend.web_server import app


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# tw3_workshop_content_dir helper


def test_workshop_content_dir_builds_path_from_drive(monkeypatch):
    """When `TW3_STEAM_LIBRARY_DRIVE` is set to a bare drive like 'F:', the helper joins the well-known suffix and yields an
    absolute path. Previously `Path("F:") / "SteamLibrary"` produced the drive-relative 'F:SteamLibrary', which made SteamCMD
    look for the workshop folder under its own CWD on the F: drive and fail with 'no content'.
    """
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "F:")
    resolved = tw3_workshop_content_dir("1234567890")
    assert resolved == Path("F:\\") / "SteamLibrary" / "steamapps" / "workshop" / "content" / "1142710" / "1234567890"
    assert resolved.is_absolute()


def test_workshop_content_dir_accepts_drive_with_trailing_separator(monkeypatch):
    """A drive value that already includes a trailing separator (e.g. 'F:\\') resolves to the same absolute path."""
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "F:\\")
    assert tw3_workshop_content_dir("1234567890") == Path("F:\\") / "SteamLibrary" / "steamapps" / "workshop" / "content" / "1142710" / "1234567890"


def test_workshop_content_dir_returns_none_when_drive_unset(monkeypatch):
    """An empty drive setting yields None so callers can return 404 cleanly."""
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "")
    assert tw3_workshop_content_dir("1234567890") is None


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# GET /packs/{workshop_id}/preview


def _set_drive(monkeypatch, tmp_path: Path) -> Path:
    """Point `TW3_STEAM_LIBRARY_DRIVE` at a tmp_path-shaped fake Steam library.

    Creates `<tmp_path>/SteamLibrary/steamapps/workshop/content/1142710/` and
    monkeypatches `config.TW3_STEAM_LIBRARY_DRIVE` so the helper resolves there.

    Args:
        monkeypatch: pytest `MonkeyPatch` fixture used to swap `config.TW3_STEAM_LIBRARY_DRIVE` for the test.
        tmp_path: pytest `tmp_path` fixture (a `Path`); the function builds the fake Steam library under it.

    Returns:
        The `1142710` parent directory so tests can drop per-workshop folders in.
    """
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", str(tmp_path))
    parent = tmp_path / "SteamLibrary" / "steamapps" / "workshop" / "content" / "1142710"
    parent.mkdir(parents=True)
    return parent


def test_preview_returns_image_when_folder_has_png(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    workshop_dir = parent / "999"
    workshop_dir.mkdir()
    (workshop_dir / "preview.png").write_bytes(b"\x89PNG\r\n\x1a\nfake")
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/preview")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content == b"\x89PNG\r\n\x1a\nfake"


def test_preview_picks_first_image_when_multiple_present(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    workshop_dir = parent / "999"
    workshop_dir.mkdir()
    (workshop_dir / "thing.pack").write_bytes(b"not an image")
    (workshop_dir / "preview.jpg").write_bytes(b"jpeg-bytes")
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/preview")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.content == b"jpeg-bytes"


def test_preview_returns_404_when_folder_missing(monkeypatch, tmp_path):
    _set_drive(monkeypatch, tmp_path)
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/preview")
    assert res.status_code == 404


def test_preview_returns_404_when_folder_has_no_image(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    workshop_dir = parent / "999"
    workshop_dir.mkdir()
    (workshop_dir / "thing.pack").write_bytes(b"not an image")
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/preview")
    assert res.status_code == 404


def test_preview_returns_400_when_workshop_id_non_numeric():
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/abc/preview")
    assert res.status_code == 400


def test_preview_returns_404_when_drive_unset(monkeypatch):
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "")
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/preview")
    assert res.status_code == 404


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# GET /packs/{workshop_id}/last_modified


def test_last_modified_returns_newest_mtime_in_folder(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    workshop_dir = parent / "999"
    workshop_dir.mkdir()
    older = workshop_dir / "thumbnail.jpg"
    older.write_bytes(b"img")
    newer = workshop_dir / "thing.pack"
    newer.write_bytes(b"pack")
    import os as _os

    _os.utime(older, (1_700_000_000, 1_700_000_000))
    _os.utime(newer, (1_750_000_000, 1_750_000_000))
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/last_modified")
    assert res.status_code == 200
    assert res.json() == {"last_modified_unix": 1_750_000_000.0}


def test_last_modified_returns_null_when_folder_empty(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    (parent / "999").mkdir()
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/last_modified")
    assert res.status_code == 200
    assert res.json() == {"last_modified_unix": None}


def test_last_modified_returns_404_when_folder_missing(monkeypatch, tmp_path):
    _set_drive(monkeypatch, tmp_path)
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/last_modified")
    assert res.status_code == 404


def test_last_modified_returns_400_when_workshop_id_non_numeric():
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/abc/last_modified")
    assert res.status_code == 400


def test_last_modified_returns_404_when_drive_unset(monkeypatch):
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "")
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/999/last_modified")
    assert res.status_code == 404


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# POST /packs/{workshop_id}/open


def test_open_pack_folder_invokes_os_startfile_on_success(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    workshop_dir = parent / "999"
    workshop_dir.mkdir()
    called_with: list[Path] = []
    monkeypatch.setattr("os.startfile", lambda path: called_with.append(Path(path)))
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/open")
    assert res.status_code == 200
    assert res.json() == {"status": "success"}
    assert called_with == [workshop_dir]


def test_open_pack_folder_returns_404_when_folder_missing(monkeypatch, tmp_path):
    _set_drive(monkeypatch, tmp_path)
    monkeypatch.setattr("os.startfile", lambda path: None)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/open")
    assert res.status_code == 404


def test_open_pack_folder_returns_400_when_workshop_id_non_numeric(monkeypatch):
    monkeypatch.setattr("os.startfile", lambda path: None)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/abc/open")
    assert res.status_code == 400


def test_open_pack_folder_returns_404_when_drive_unset(monkeypatch):
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "")
    monkeypatch.setattr("os.startfile", lambda path: None)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/open")
    assert res.status_code == 404


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# POST /packs/{workshop_id}/publish

from datetime import datetime, timezone

from backend.games.total_war_warhammer_3 import workshop_publisher as wp


def _make_handle(workshop_id: str = "999") -> wp.PublishHandle:
    return wp.PublishHandle(
        publish_id="test-publish-id",
        workshop_id=workshop_id,
        started_at=datetime(2026, 5, 14, 0, 0, 0, tzinfo=timezone.utc),
    )


def test_publish_returns_400_when_workshop_id_non_numeric():
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/abc/publish", json={"changenote": ""})
    assert res.status_code == 400


def test_publish_returns_404_when_folder_missing(monkeypatch, tmp_path):
    _set_drive(monkeypatch, tmp_path)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/publish", json={"changenote": ""})
    assert res.status_code == 404


def test_publish_returns_400_with_missing_when_preflight_fails(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    (parent / "999").mkdir()

    def fake_start_publish(*args, **kwargs):
        raise wp.PublisherPreflightError(["steamcmd_path", "steam_username"])

    monkeypatch.setattr(wp, "start_publish", fake_start_publish)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/publish", json={"changenote": ""})
    assert res.status_code == 400
    assert res.json() == {"detail": {"missing": ["steamcmd_path", "steam_username"]}}


def test_publish_returns_409_when_already_in_progress(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    (parent / "999").mkdir()

    def fake_start_publish(*args, **kwargs):
        raise wp.PublishInProgressError("999")

    monkeypatch.setattr(wp, "start_publish", fake_start_publish)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/publish", json={"changenote": ""})
    assert res.status_code == 409


def test_publish_returns_handle_on_success(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    (parent / "999").mkdir()

    captured: dict = {}

    def fake_start_publish(workshop_id, content_folder, changenote, *, steamcmd_path, steam_username):
        captured["workshop_id"] = workshop_id
        captured["changenote"] = changenote
        captured["content_folder"] = content_folder
        return _make_handle(workshop_id)

    monkeypatch.setattr(wp, "start_publish", fake_start_publish)
    res = TestClient(app).post("/api/games/total_war_warhammer_3/packs/999/publish", json={"changenote": "fix typo"})
    assert res.status_code == 200
    body = res.json()
    assert body["publish_id"] == "test-publish-id"
    assert body["workshop_id"] == "999"
    assert captured["workshop_id"] == "999"
    assert captured["changenote"] == "fix typo"


def test_publish_stream_returns_400_when_workshop_id_non_numeric():
    res = TestClient(app).get("/api/games/total_war_warhammer_3/packs/abc/publish/stream")
    assert res.status_code == 400


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# POST /packs/publish-all

from backend.games.total_war_warhammer_3 import workshop_batch_publisher as wbp

_PUBLISH_ALL = "/api/games/total_war_warhammer_3/packs/publish-all"


def _stub_batch_publisher(monkeypatch, parent: Path, workshop_ids: list[str], exit_codes: dict[str, int] | None = None):
    """Create real folders for `workshop_ids` and stub `wp.start_publish` + `wp.stream_lines`.

    `exit_codes` maps a workshop_id to the SteamCMD exit code to inject (default 0 for all).
    """
    exit_codes = exit_codes or {}
    for wid in workshop_ids:
        (parent / wid).mkdir(exist_ok=True)

    current_id: dict[str, str] = {"id": ""}

    def fake_start_publish(workshop_id, content_folder, changenote, *, steamcmd_path, steam_username, **_kw):
        current_id["id"] = workshop_id
        return _make_handle(workshop_id)

    async def fake_stream_lines():
        wid = current_id["id"]
        yield {"event": "data", "line": f"line for {wid}", "ts": "t"}
        yield {"event": "done", "exit_code": exit_codes.get(wid, 0), "duration_seconds": 0.1}

    monkeypatch.setattr(wp, "start_publish", fake_start_publish)
    monkeypatch.setattr(wp, "stream_lines", fake_stream_lines)
    monkeypatch.setattr(wp, "is_idle", lambda: True)


def test_publish_all_returns_400_when_changenote_empty(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    wbp._reset_state()
    _stub_batch_publisher(monkeypatch, parent, ["999"])
    res = TestClient(app).post(_PUBLISH_ALL, json={"changenote": "", "items": [{"workshop_id": "999", "title": "Mod"}]})
    assert res.status_code == 400


def test_publish_all_returns_400_when_items_empty(monkeypatch):
    wbp._reset_state()
    monkeypatch.setattr(wp, "is_idle", lambda: True)
    res = TestClient(app).post(_PUBLISH_ALL, json={"changenote": "notes", "items": []})
    assert res.status_code == 400


def test_publish_all_returns_400_when_no_valid_workshop_ids(monkeypatch):
    wbp._reset_state()
    monkeypatch.setattr(wp, "is_idle", lambda: True)
    res = TestClient(app).post(
        _PUBLISH_ALL,
        json={"changenote": "notes", "items": [{"workshop_id": "", "title": "A"}, {"workshop_id": "abc", "title": "B"}]},
    )
    assert res.status_code == 400


def test_publish_all_filters_invalid_workshop_ids_and_returns_skipped_list(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    wbp._reset_state()
    _stub_batch_publisher(monkeypatch, parent, ["999"])
    res = TestClient(app).post(
        _PUBLISH_ALL,
        json={
            "changenote": "notes",
            "items": [
                {"workshop_id": "999", "title": "Valid"},
                {"workshop_id": "", "title": "Empty"},
                {"workshop_id": "abc", "title": "Bad"},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["queued"] == 1
    skipped_ids = sorted(s["title"] for s in body["skipped"])
    assert skipped_ids == ["Bad", "Empty"]
    assert "batch_id" in body
    assert "started_at" in body


def test_publish_all_returns_409_when_single_publish_in_progress(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    wbp._reset_state()
    (parent / "999").mkdir()
    monkeypatch.setattr(wp, "is_idle", lambda: False)
    res = TestClient(app).post(_PUBLISH_ALL, json={"changenote": "notes", "items": [{"workshop_id": "999", "title": "Mod"}]})
    assert res.status_code == 409


def test_publish_all_stream_returns_404_for_unknown_batch_id(monkeypatch):
    wbp._reset_state()
    res = TestClient(app).get(f"{_PUBLISH_ALL}/stream/does-not-exist")
    assert res.status_code == 404


def test_publish_all_stream_returns_event_stream_with_batch_started_first(monkeypatch, tmp_path):
    parent = _set_drive(monkeypatch, tmp_path)
    wbp._reset_state()
    _stub_batch_publisher(monkeypatch, parent, ["999"])
    post = TestClient(app).post(_PUBLISH_ALL, json={"changenote": "notes", "items": [{"workshop_id": "999", "title": "Mod"}]})
    assert post.status_code == 200
    batch_id = post.json()["batch_id"]

    with TestClient(app) as client:
        res = client.get(f"{_PUBLISH_ALL}/stream/{batch_id}")
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        text = res.text
        assert "event: batch_started" in text
        assert "event: batch_done" in text
