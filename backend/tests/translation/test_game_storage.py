"""Tests for the GameStorage per-game path facade."""

from pathlib import Path

from backend import config
from backend.translation.game_storage import GameStorage


def test_paths_resolve_under_the_per_game_namespace(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config, "STORAGE_PATH", tmp_path, raising=True)
    storage = GameStorage("chrono_ark")
    assert storage.root == tmp_path / "games" / "chrono_ark"
    assert storage.mods_dir == tmp_path / "games" / "chrono_ark" / "mods"
    assert storage.mod_dir("123") == tmp_path / "games" / "chrono_ark" / "mods" / "123"
    assert storage.mod_file("123", "synced_keys.json") == tmp_path / "games" / "chrono_ark" / "mods" / "123" / "synced_keys.json"


def test_game_id_is_stored():
    assert GameStorage("total_war_warhammer_3").game_id == "total_war_warhammer_3"
