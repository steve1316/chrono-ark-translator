"""Tests for the multi-game workbench chassis."""

from backend.games.capabilities.translation import TranslationCapability
from backend.games.chrono_ark.adapter import ChronoArkAdapter


def test_chrono_ark_adapter_implements_translation_capability():
    adapter = ChronoArkAdapter()
    assert isinstance(adapter, TranslationCapability)
    assert "translation" in adapter.capabilities


def test_chrono_ark_adapter_has_chassis_metadata():
    adapter = ChronoArkAdapter()
    assert adapter.game_id == "chrono_ark"
    assert adapter.display_name
    assert adapter.icon


def test_list_games_metadata_returns_chrono_ark():
    from backend.games.registry import list_games_metadata
    metadata = list_games_metadata()
    chrono = next((m for m in metadata if m["game_id"] == "chrono_ark"), None)
    assert chrono is not None
    assert chrono["display_name"] == "Chrono Ark"
    assert chrono["icon"] == "chrono_ark"
    assert "translation" in chrono["capabilities"]


def test_api_games_endpoint_lists_chrono_ark():
    from fastapi.testclient import TestClient
    from backend.web_server import app
    client = TestClient(app)
    res = client.get("/api/games")
    assert res.status_code == 200
    data = res.json()
    chrono = next((g for g in data if g["game_id"] == "chrono_ark"), None)
    assert chrono is not None


def test_tw3_stub_adapter_registered():
    from backend.games.registry import list_games_metadata, get_adapter
    metadata = list_games_metadata()
    tw3 = next((m for m in metadata if m["game_id"] == "total_war_warhammer_3"), None)
    assert tw3 is not None
    assert tw3["display_name"] == "Warhammer III"
    assert tw3["capabilities"] == []
    adapter = get_adapter("total_war_warhammer_3")
    assert adapter.game_id == "total_war_warhammer_3"
