"""Tests for the TW3 registry routes."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsNotConfiguredError,
    RegistryFileSyntaxError,
)
from backend.web_server import app

FIXTURES = Path(__file__).parent / "fixtures" / "helper_scripts"


def test_get_supported_mods_returns_data(monkeypatch):
    monkeypatch.setattr("backend.games.total_war_warhammer_3.routes.registry.config.TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/supported-mods")
    assert res.status_code == 200
    body = res.json()
    assert body["mods"][0]["name"] == "Test Mod A"
    assert len(body["mods"]) == 2


def test_get_supported_mods_returns_503_when_path_unset():
    client = TestClient(app)
    with patch(
        "backend.games.total_war_warhammer_3.routes.registry.load_supported_mods",
        side_effect=HelperScriptsNotConfiguredError("missing"),
    ):
        res = client.get("/api/games/total_war_warhammer_3/supported-mods")
    assert res.status_code == 503
    assert "helper_scripts_path" in res.json()["detail"]


def test_get_effects_returns_data(monkeypatch):
    monkeypatch.setattr("backend.games.total_war_warhammer_3.routes.registry.config.TW3_HELPER_PATH", str(FIXTURES))
    client = TestClient(app)
    res = client.get("/api/games/total_war_warhammer_3/effects")
    assert res.status_code == 200
    body = res.json()
    assert "infantry" in body["effects"]


def test_get_effects_returns_500_on_syntax_error():
    client = TestClient(app)
    with patch(
        "backend.games.total_war_warhammer_3.routes.registry.load_supported_effects",
        side_effect=RegistryFileSyntaxError("oops"),
    ):
        res = client.get("/api/games/total_war_warhammer_3/effects")
    assert res.status_code == 500
    assert "oops" in res.json()["detail"]
