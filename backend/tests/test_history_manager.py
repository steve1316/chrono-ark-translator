"""Tests for the Chrono Ark history manager, focused on the auto/manual kind field."""

import json
from pathlib import Path

from backend.data.history_manager import create_backup, list_backups


def _seed(tmp_path: Path, mod_id: str) -> Path:
    """Seed a mod dir with a translations.json so a backup has something to capture."""
    mod_dir = tmp_path / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(json.dumps({"k1": "Hello"}), encoding="utf-8")
    return mod_dir


def test_create_backup_defaults_to_auto_kind(tmp_path: Path):
    _seed(tmp_path, "abc")
    create_backup("abc", "Before sync", storage_path=tmp_path)
    backups = list_backups("abc", storage_path=tmp_path)
    assert len(backups) == 1
    assert backups[0]["kind"] == "auto"
    assert backups[0]["reason"] == "Before sync"


def test_create_backup_records_manual_kind(tmp_path: Path):
    _seed(tmp_path, "abc")
    create_backup("abc", "My checkpoint", storage_path=tmp_path, kind="manual")
    backups = list_backups("abc", storage_path=tmp_path)
    assert len(backups) == 1
    assert backups[0]["kind"] == "manual"
    assert backups[0]["reason"] == "My checkpoint"


def test_list_backups_backfills_missing_kind_as_auto(tmp_path: Path):
    _seed(tmp_path, "abc")
    backup_id = create_backup("abc", "Old backup", storage_path=tmp_path)
    # Simulate a legacy backup whose meta.json predates the kind field.
    meta_path = tmp_path / "mods" / "abc" / "history" / backup_id / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    del meta["kind"]
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    backups = list_backups("abc", storage_path=tmp_path)
    assert backups[0]["kind"] == "auto"
