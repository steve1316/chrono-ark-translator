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
