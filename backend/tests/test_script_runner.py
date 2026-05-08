"""Tests for the TW3 script runner."""

from pathlib import Path

import pytest

from backend.games.total_war_warhammer_3.script_runner import (
    SCRIPT_REGISTRY,
    PreflightError,
    ScriptDef,
    UnknownScriptError,  # noqa: F401 -- used by Task 5 tests
    _preflight,
)

FIXTURES = Path(__file__).parent / "fixtures" / "helper_scripts"


def test_script_registry_has_six_entries():
    assert set(SCRIPT_REGISTRY.keys()) == {
        "update_dynamic_rors",
        "update_dynamic_rors_vanilla",
        "update_double_unit_size",
        "update_modified_attribute_mods",
        "process_main_units_tables",
        "update",
    }


def test_script_def_for_vanilla_mode():
    sd = SCRIPT_REGISTRY["update_dynamic_rors_vanilla"]
    assert isinstance(sd, ScriptDef)
    assert sd.filename == "update_dynamic_rors.py"
    assert sd.args == ["--reset", "--vanilla"]


def _settings(helper=FIXTURES, rpfm=None, drive="F:"):
    return {
        "helper_scripts_path": str(helper) if helper else "",
        "rpfm_cli_path": str(rpfm) if rpfm else "",
        "steam_library_drive": drive,
    }


def test_preflight_passes_with_valid_settings():
    _preflight(_settings())  # does not raise


def test_preflight_fails_when_helper_scripts_unset():
    with pytest.raises(PreflightError) as exc:
        _preflight(_settings(helper=None))
    assert "helper_scripts_path" in exc.value.missing


def test_preflight_fails_when_rpfm_missing(tmp_path):
    # Create a directory without rpfm_cli.exe.
    (tmp_path / "schemas").mkdir()
    (tmp_path / "schemas" / "schema_wh3.ron").write_text("")
    (tmp_path / "schemas" / "schema_wh3.json").write_text("{}")
    with pytest.raises(PreflightError) as exc:
        _preflight(_settings(helper=tmp_path))
    assert any("rpfm_cli" in m for m in exc.value.missing)


def test_preflight_fails_when_steam_drive_unset():
    with pytest.raises(PreflightError) as exc:
        _preflight(_settings(drive=""))
    assert "steam_library_drive" in exc.value.missing
