"""Tests for the TW3 packs preview route and helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend import config
from backend.games.total_war_warhammer_3.routes._paths import tw3_workshop_content_dir


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# tw3_workshop_content_dir helper

def test_workshop_content_dir_builds_path_from_drive(monkeypatch):
    """When `TW3_STEAM_LIBRARY_DRIVE` is set, the helper joins the well-known suffix."""
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "F:")
    assert tw3_workshop_content_dir("1234567890") == Path("F:") / "SteamLibrary" / "steamapps" / "workshop" / "content" / "1142710" / "1234567890"


def test_workshop_content_dir_returns_none_when_drive_unset(monkeypatch):
    """An empty drive setting yields None so callers can return 404 cleanly."""
    monkeypatch.setattr(config, "TW3_STEAM_LIBRARY_DRIVE", "")
    assert tw3_workshop_content_dir("1234567890") is None


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# GET /packs/{workshop_id}/preview

from fastapi.testclient import TestClient

from backend.web_server import app


def _set_drive(monkeypatch, tmp_path: Path) -> Path:
    """Point `TW3_STEAM_LIBRARY_DRIVE` at a tmp_path-shaped fake Steam library.

    Creates `<tmp_path>/SteamLibrary/steamapps/workshop/content/1142710/` and
    monkeypatches `config.TW3_STEAM_LIBRARY_DRIVE` so the helper resolves there.

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
