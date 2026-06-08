import subprocess
from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3 import loc_tsv_packer
from backend.games.total_war_warhammer_3.loc_tsv_packer import (
    AmbiguousPackError,
    PackNotFoundError,
    RpfmFailedError,
    RpfmNotConfiguredError,
    build_translation_pack,
    resolve_rpfm_cli_path,
    resolve_target_pack,
)
from backend.games.total_war_warhammer_3.translation_mods import WH3TranslationMod


def test_resolve_target_pack_returns_single_pack(tmp_path: Path):
    (tmp_path / "MyMod.pack").write_bytes(b"x")
    assert resolve_target_pack(tmp_path) == tmp_path / "MyMod.pack"


def test_resolve_target_pack_raises_when_no_pack(tmp_path: Path):
    with pytest.raises(PackNotFoundError):
        resolve_target_pack(tmp_path)


def test_resolve_target_pack_raises_when_dir_missing(tmp_path: Path):
    with pytest.raises(PackNotFoundError):
        resolve_target_pack(tmp_path / "nope")


def test_resolve_target_pack_raises_when_multiple_packs(tmp_path: Path):
    (tmp_path / "a.pack").write_bytes(b"x")
    (tmp_path / "b.pack").write_bytes(b"x")
    with pytest.raises(AmbiguousPackError):
        resolve_target_pack(tmp_path)


def _mod(source_dir: Path) -> WH3TranslationMod:
    return WH3TranslationMod(
        workshop_id="3315737452",
        display_name="Test",
        parent_workshop_ids=("111",),
        local_source_dir=source_dir,
    )


def test_build_translation_pack_invokes_rpfm_delete_then_add(monkeypatch, tmp_path: Path):
    rpfm = tmp_path / "rpfm_cli.exe"
    rpfm.write_bytes(b"x")
    content_dir = tmp_path / "content"
    content_dir.mkdir()
    pack = content_dir / "MyMod.pack"
    pack.write_bytes(b"x")
    source_dir = tmp_path / "src"
    source_dir.mkdir()

    calls: list[list[str]] = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        result = subprocess.CompletedProcess(cmd, 0)
        result.returncode = 0
        result.stderr = b""
        assert kwargs["cwd"] == str(rpfm.parent)
        return result

    monkeypatch.setattr(subprocess, "run", fake_run)

    returned = build_translation_pack(_mod(source_dir), rpfm_cli_path=rpfm, workshop_content_dir=content_dir)

    assert returned == pack
    assert len(calls) == 2
    assert calls[0][:3] == [str(rpfm), "--game", "warhammer_3"]
    assert "delete" in calls[0] and "--folder-path" in calls[0] and "text" in calls[0]
    assert "--pack-path" in calls[0] and str(pack) in calls[0]
    assert "add" in calls[1] and "--tsv-to-binary" in calls[1]
    assert f"{source_dir};" in calls[1]
    schema = str(rpfm.parent / "schemas" / "schema_wh3.ron")
    assert schema in calls[1]


def test_build_translation_pack_raises_on_rpfm_nonzero(monkeypatch, tmp_path: Path):
    rpfm = tmp_path / "rpfm_cli.exe"
    rpfm.write_bytes(b"x")
    content_dir = tmp_path / "content"
    content_dir.mkdir()
    (content_dir / "MyMod.pack").write_bytes(b"x")

    def fake_run(cmd, **kwargs):
        result = subprocess.CompletedProcess(cmd, 2)
        result.returncode = 2
        result.stderr = b"boom"
        return result

    monkeypatch.setattr(subprocess, "run", fake_run)

    with pytest.raises(RpfmFailedError):
        build_translation_pack(_mod(tmp_path / "src"), rpfm_cli_path=rpfm, workshop_content_dir=content_dir)


def test_build_translation_pack_raises_when_rpfm_missing(tmp_path: Path):
    content_dir = tmp_path / "content"
    content_dir.mkdir()
    (content_dir / "MyMod.pack").write_bytes(b"x")
    with pytest.raises(RpfmNotConfiguredError):
        build_translation_pack(_mod(tmp_path / "src"), rpfm_cli_path=tmp_path / "missing.exe", workshop_content_dir=content_dir)


def test_resolve_rpfm_cli_path_prefers_config(monkeypatch, tmp_path: Path):
    rpfm = tmp_path / "rpfm_cli.exe"
    rpfm.write_bytes(b"x")
    monkeypatch.setattr(loc_tsv_packer.config, "TW3_RPFM_CLI_PATH", str(rpfm))
    assert resolve_rpfm_cli_path() == rpfm


def test_resolve_rpfm_cli_path_returns_none_when_unset(monkeypatch):
    monkeypatch.setattr(loc_tsv_packer.config, "TW3_RPFM_CLI_PATH", "")
    monkeypatch.setattr(loc_tsv_packer.config, "TW3_HELPER_PATH", "")
    assert resolve_rpfm_cli_path() is None
