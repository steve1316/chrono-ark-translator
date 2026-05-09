"""Tests for the importlib-based helper_scripts loader."""

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.helper_scripts_loader import (
    HelperScriptsNotConfiguredError,
    RegistryConstantNotFoundError,
    RegistryFileMissingError,
    RegistryFileSyntaxError,
    load_supported_effects,
    load_supported_mods,
)

FIXTURES = Path(__file__).parent / "fixtures" / "helper_scripts"


def test_load_supported_mods_returns_list_of_dicts():
    mods = load_supported_mods(FIXTURES)
    assert isinstance(mods, list)
    assert len(mods) == 2
    assert mods[0]["name"] == "Test Mod A"


def test_load_supported_effects_returns_dict():
    effects = load_supported_effects(FIXTURES)
    assert isinstance(effects, dict)
    assert "infantry" in effects
    assert effects["cavalry"]["empire"] == ["bundle_c"]


def test_load_raises_when_path_unset(tmp_path):
    nonexistent = tmp_path / "does_not_exist"
    with pytest.raises(HelperScriptsNotConfiguredError):
        load_supported_mods(nonexistent)


def test_load_raises_when_file_missing(tmp_path):
    # tmp_path exists but has no supported_mods.py
    with pytest.raises(RegistryFileMissingError):
        load_supported_mods(tmp_path)


def test_load_raises_on_syntax_error():
    # The fixtures dir has _test_syntax_error.py; we point the loader at a
    # custom filename via the internal helper to test syntax-error handling.
    from backend.games.total_war_warhammer_3.helper_scripts_loader import _load_constant

    with pytest.raises(RegistryFileSyntaxError):
        _load_constant(FIXTURES, "_test_syntax_error.py", "SUPPORTED_MODS")


def test_load_raises_when_constant_missing():
    from backend.games.total_war_warhammer_3.helper_scripts_loader import _load_constant

    with pytest.raises(RegistryConstantNotFoundError):
        _load_constant(FIXTURES, "missing_constant.py", "SUPPORTED_MODS")


def test_load_resolves_sibling_imports():
    """The real `supported_mods.py` imports `from utilities import STEAM_LIBRARY_DRIVE`,
    so the loader must put `helper_scripts_path` on `sys.path` for the duration of
    the import. This test exercises that contract via fixture files."""
    import sys

    from backend.games.total_war_warhammer_3.helper_scripts_loader import _load_constant

    before = list(sys.path)
    result = _load_constant(FIXTURES, "with_sibling_constant.py", "WITH_SIBLING")
    after = list(sys.path)

    assert result == [{"name": "uses sibling", "value": "loaded-from-sibling"}]
    # `sys.path` must be restored to its pre-call state.
    assert before == after
