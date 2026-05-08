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
