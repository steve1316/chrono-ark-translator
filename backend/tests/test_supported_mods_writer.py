"""Tests for the libcst-based SUPPORTED_MODS writer."""

from __future__ import annotations

import pytest

from backend.games.total_war_warhammer_3.supported_mods_writer import (
    DuplicatePackageError,
    EntryNotFoundError,
    add_entry,
    remove_entry,
    update_entry,
)


_BASE_SOURCE = '''from utilities import STEAM_LIBRARY_DRIVE

SUPPORTED_MODS = [
    {
        "name": "Vanilla",
        "package_name": "vanilla",
        "path": "",
        "modified_attributes": [],
    },
]
'''


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# add_entry


def test_add_entry_appends_new_workshop_mod():
    entry = {
        "name": "My Mod",
        "package_name": "my_mod.pack",
        "workshop_id": "1234567890",
        "modified_attributes": ["melee_attack"],
    }
    result = add_entry(_BASE_SOURCE, entry)

    # The new entry should appear in the list and the path should be the f-string form.
    assert '"name": "My Mod"' in result
    assert '"package_name": "my_mod.pack"' in result
    assert 'f"{STEAM_LIBRARY_DRIVE}/SteamLibrary/steamapps/workshop/content/1142710/1234567890/my_mod.pack"' in result
    assert '"modified_attributes": ["melee_attack"]' in result
