"""Tests for the WH3 snapshot store."""

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.snapshot_store import (
    create_snapshot,
    delete_snapshot,
    list_snapshots,
    restore_snapshot,
)


def _seed_translations(monkeypatch, tmp_path: Path, mod_id: str, data: dict) -> None:
    import json

    monkeypatch.setattr("backend.config.STORAGE_PATH", tmp_path, raising=True)
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / mod_id
    mod_dir.mkdir(parents=True, exist_ok=True)
    (mod_dir / "translations.json").write_text(json.dumps(data), encoding="utf-8")


def test_create_returns_ulid_and_writes_index(monkeypatch, tmp_path: Path):
    _seed_translations(monkeypatch, tmp_path, "abc", {"k1": {"text": "Hello", "provider": "manual"}})
    sid = create_snapshot("abc", label="manual save", kind="manual")
    assert isinstance(sid, str) and len(sid) > 0
    metas = list_snapshots("abc")
    assert len(metas) == 1
    assert metas[0]["ulid"] == sid
    assert metas[0]["label"] == "manual save"
    assert metas[0]["kind"] == "manual"


def test_list_orders_newest_first(monkeypatch, tmp_path: Path):
    _seed_translations(monkeypatch, tmp_path, "abc", {})
    ids: list[str] = []
    for i in range(3):
        ids.append(create_snapshot("abc", label=f"snap-{i}", kind="auto"))
    metas = list_snapshots("abc")
    assert [m["ulid"] for m in metas] == list(reversed(ids))


def test_create_prunes_to_last_20(monkeypatch, tmp_path: Path):
    _seed_translations(monkeypatch, tmp_path, "abc", {})
    for i in range(25):
        create_snapshot("abc", label=f"snap-{i}", kind="auto")
    metas = list_snapshots("abc")
    assert len(metas) == 20
    # Oldest five pruned.
    labels = [m["label"] for m in metas]
    assert "snap-0" not in labels
    assert "snap-24" in labels


def test_delete_removes_one(monkeypatch, tmp_path: Path):
    _seed_translations(monkeypatch, tmp_path, "abc", {})
    sid = create_snapshot("abc", label="x", kind="auto")
    delete_snapshot("abc", sid)
    assert list_snapshots("abc") == []


def test_restore_rewrites_translations_json(monkeypatch, tmp_path: Path):
    import json

    _seed_translations(monkeypatch, tmp_path, "abc", {"k1": {"text": "Hello", "provider": "manual"}})
    sid = create_snapshot("abc", label="before edit", kind="auto")
    # Mutate translations.json
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / "abc"
    (mod_dir / "translations.json").write_text(json.dumps({"k1": {"text": "Changed"}}), encoding="utf-8")
    # Restore
    restore_snapshot("abc", sid)
    body = json.loads((mod_dir / "translations.json").read_text(encoding="utf-8"))
    assert body["k1"]["text"] == "Hello"


def test_restore_creates_pre_restore_snapshot(monkeypatch, tmp_path: Path):
    import json

    _seed_translations(monkeypatch, tmp_path, "abc", {"k1": {"text": "v1"}})
    s1 = create_snapshot("abc", label="s1", kind="auto")
    # Mutate
    mod_dir = tmp_path / "games" / "total_war_warhammer_3" / "mods" / "abc"
    (mod_dir / "translations.json").write_text(json.dumps({"k1": {"text": "v2"}}), encoding="utf-8")
    restore_snapshot("abc", s1)
    # We now expect a NEW auto-snapshot taken just before the restore (capturing v2 state).
    metas = list_snapshots("abc")
    assert len(metas) == 2
    pre_restore = metas[0]
    assert pre_restore["kind"] == "auto"
    assert "pre-restore" in pre_restore["label"].lower()
