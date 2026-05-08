"""Tests for the TW3 script runner."""

from backend.games.total_war_warhammer_3.script_runner import SCRIPT_REGISTRY, ScriptDef


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
