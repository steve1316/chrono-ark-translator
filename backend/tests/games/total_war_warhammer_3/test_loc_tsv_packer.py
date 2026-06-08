from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.loc_tsv_packer import (
    AmbiguousPackError,
    PackNotFoundError,
    resolve_target_pack,
)


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
