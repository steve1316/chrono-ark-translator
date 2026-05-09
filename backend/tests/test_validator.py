"""Tests for the TW3 FK validator."""

from pathlib import Path

from backend.games.total_war_warhammer_3.validator import validate_registries


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Helpers

def _mod(name: str, package_name: str, **kwargs) -> dict:
    """Build a minimal mod dict with required identity fields plus any extras.

    @param name: Human-readable display name.
    @param package_name: Stable identity key.
    @param kwargs: Additional fields to merge into the dict.
    @returns: A mod dict suitable for passing to `validate_registries`.
    """
    return {"name": name, "package_name": package_name, **kwargs}


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Category check tests

def test_empty_registries_yields_no_issues():
    issues = validate_registries([], {})
    assert issues == []


def test_mod_with_no_modified_attributes_passes_category_check():
    """Covers missing field, None, and empty list - all should skip the category check."""
    effects = {"infantry": {}}
    mods = [
        _mod("Mod A", "mod_a"),  # missing modified_attributes field
        _mod("Mod B", "mod_b", modified_attributes=None),
        _mod("Mod C", "mod_c", modified_attributes=[]),
    ]
    issues = validate_registries(mods, effects)
    category_issues = [i for i in issues if i["kind"] == "missing_effect_category"]
    assert category_issues == []


def test_missing_effect_category_emits_issue():
    effects = {"infantry": {}}
    mods = [_mod("Mod A", "mod_a", path="/fake/a.pack", modified_attributes=["melee"])]
    issues = validate_registries(mods, effects)
    category_issues = [i for i in issues if i["kind"] == "missing_effect_category"]
    assert len(category_issues) == 1
    issue = category_issues[0]
    assert issue["kind"] == "missing_effect_category"
    assert issue["severity"] == "error"
    assert issue["mod_package_name"] == "mod_a"
    assert issue["mod_name"] == "Mod A"
    assert issue["target"] == "melee"
    assert issue["message"] == "modified_attributes references 'melee' but no such category exists in SUPPORTED_EFFECTS"


def test_present_effect_category_emits_no_issue():
    effects = {"melee": {}, "infantry": {}}
    mods = [_mod("Mod A", "mod_a", path="/fake/a.pack", modified_attributes=["melee", "infantry"])]
    issues = validate_registries(mods, effects)
    category_issues = [i for i in issues if i["kind"] == "missing_effect_category"]
    assert category_issues == []


def test_multiple_missing_categories_for_one_mod():
    effects = {"infantry": {}}
    mods = [_mod("Mod A", "mod_a", path="/fake/a.pack", modified_attributes=["melee", "cavalry", "artillery"])]
    issues = validate_registries(mods, effects)
    category_issues = [i for i in issues if i["kind"] == "missing_effect_category"]
    assert len(category_issues) == 3
    targets = {i["target"] for i in category_issues}
    assert targets == {"melee", "cavalry", "artillery"}


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Path check tests

def test_missing_path_field_emits_issue():
    """Covers missing field, None, and empty string - all should emit missing_mod_path with target=''."""
    mods = [
        _mod("Mod A", "mod_a"),  # missing path field
        _mod("Mod B", "mod_b", path=None),
        _mod("Mod C", "mod_c", path=""),
    ]
    issues = validate_registries(mods, {})
    path_issues = [i for i in issues if i["kind"] == "missing_mod_path"]
    assert len(path_issues) == 3
    for issue in path_issues:
        assert issue["severity"] == "error"
        assert issue["target"] == ""
        assert issue["message"] == "path field is missing or empty"


def test_existing_path_emits_no_issue(tmp_path: Path):
    real_file = tmp_path / "real.pack"
    real_file.write_bytes(b"x")
    mods = [_mod("Mod A", "mod_a", path=str(real_file))]
    issues = validate_registries(mods, {})
    path_issues = [i for i in issues if i["kind"] == "missing_mod_path"]
    assert path_issues == []


def test_nonexistent_path_emits_issue():
    mods = [_mod("Mod A", "mod_a", path="/nonexistent/fake.pack")]
    issues = validate_registries(mods, {})
    path_issues = [i for i in issues if i["kind"] == "missing_mod_path"]
    assert len(path_issues) == 1
    issue = path_issues[0]
    assert issue["kind"] == "missing_mod_path"
    assert issue["severity"] == "error"
    assert issue["mod_package_name"] == "mod_a"
    assert issue["mod_name"] == "Mod A"
    assert issue["target"] == "/nonexistent/fake.pack"
    assert issue["message"] == "path '/nonexistent/fake.pack' does not exist on disk"


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Sort and combined tests

def test_issues_sorted_by_mod_name_then_kind_then_target():
    """Verify sort order is (mod_name, kind, target) regardless of input order."""
    effects = {}
    mods = [
        _mod("Zeta Mod", "zeta", path="/fake/z.pack", modified_attributes=["archer"]),
        _mod("Alpha Mod", "alpha", path="/fake/a.pack", modified_attributes=["berserker"]),
    ]
    issues = validate_registries(mods, effects)
    # Path issues come from non-existing paths; category issues from missing effects.
    # Sort key: (mod_name, kind, target).
    names = [i["mod_name"] for i in issues]
    # All Alpha Mod issues must appear before Zeta Mod issues.
    alpha_indices = [j for j, i in enumerate(issues) if i["mod_name"] == "Alpha Mod"]
    zeta_indices = [j for j, i in enumerate(issues) if i["mod_name"] == "Zeta Mod"]
    assert max(alpha_indices) < min(zeta_indices)


def test_both_kinds_for_one_mod():
    """A mod with a missing effect category AND a nonexistent path emits both issue kinds."""
    effects = {"infantry": {}}
    mods = [_mod("Mod A", "mod_a", path="/nonexistent/fake.pack", modified_attributes=["cavalry"])]
    issues = validate_registries(mods, effects)
    kinds = {i["kind"] for i in issues}
    assert kinds == {"missing_effect_category", "missing_mod_path"}
    assert len(issues) == 2
