"""Tests for the TW3 registry routes."""

from fastapi.testclient import TestClient

from backend.web_server import app


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# POST /supported-mods


_FIXTURE_SOURCE = '''from utilities import STEAM_LIBRARY_DRIVE

SUPPORTED_MODS = [
    {
        "name": "Vanilla",
        "package_name": "vanilla",
        "path": "",
        "modified_attributes": [],
    },
]
'''


def _setup_helper(monkeypatch, tmp_path):
    """Create a minimal helper_scripts directory and point config at it.

    Args:
        monkeypatch: pytest monkeypatch fixture.
        tmp_path: pytest tmp_path fixture.

    Returns:
        The created helper_scripts `Path`.
    """
    helper = tmp_path / "helper_scripts"
    helper.mkdir()
    (helper / "utilities.py").write_text('STEAM_LIBRARY_DRIVE = "F:"\n')
    (helper / "supported_mods.py").write_text(_FIXTURE_SOURCE)
    monkeypatch.setattr("backend.config.TW3_HELPER_PATH", str(helper))
    return helper


def test_post_supported_mods_adds_new_entry(monkeypatch, tmp_path):
    """POST with a new package_name returns 200 and the mod appears in the list."""
    _setup_helper(monkeypatch, tmp_path)
    body = {
        "entry": {
            "name": "New Mod",
            "package_name": "new.pack",
            "workshop_id": "1234567890",
            "modified_attributes": ["melee_attack"],
        }
    }
    res = TestClient(app).post("/api/games/total_war_warhammer_3/supported-mods", json=body)
    assert res.status_code == 200
    mods = res.json()["mods"]
    assert any(m["package_name"] == "new.pack" for m in mods)


def test_post_supported_mods_returns_409_on_duplicate(monkeypatch, tmp_path):
    """POST with an existing package_name returns 409 Conflict."""
    _setup_helper(monkeypatch, tmp_path)
    body = {"entry": {"name": "Dup", "package_name": "vanilla", "modified_attributes": []}}
    res = TestClient(app).post("/api/games/total_war_warhammer_3/supported-mods", json=body)
    assert res.status_code == 409


def test_post_supported_mods_returns_503_when_helper_path_unset(monkeypatch):
    """POST returns 503 when TW3_HELPER_PATH is not configured."""
    monkeypatch.setattr("backend.config.TW3_HELPER_PATH", "")
    body = {"entry": {"name": "X", "package_name": "x.pack", "modified_attributes": []}}
    res = TestClient(app).post("/api/games/total_war_warhammer_3/supported-mods", json=body)
    assert res.status_code == 503
