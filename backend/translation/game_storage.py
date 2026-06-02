"""Per-game storage path facade.

`GameStorage(game_id)` is the single authority for where a game's per-mod files
live. Every path resolves under `game_storage_path(game_id)`, so callers must
never join `config.STORAGE_PATH` directly.
"""

from __future__ import annotations

from pathlib import Path

from backend.games.storage_paths import game_storage_path


class GameStorage:
    """Resolves per-game, per-mod storage paths under a single game root.

    Attributes:
        game_id: The adapter id whose storage this facade addresses.
    """

    def __init__(self, game_id: str) -> None:
        self.game_id = game_id

    @property
    def root(self) -> Path:
        """Return the per-game storage root (`<STORAGE_PATH>/games/<game_id>`)."""
        return game_storage_path(self.game_id)

    @property
    def mods_dir(self) -> Path:
        """Return the per-game mods directory (`<root>/mods`)."""
        return self.root / "mods"

    def mod_dir(self, mod_id: str) -> Path:
        """Return the storage directory for a single mod (`<mods_dir>/<mod_id>`).

        Args:
            mod_id: The mod whose directory to resolve.

        Returns:
            `<root>/mods/<mod_id>`.
        """
        return self.mods_dir / mod_id

    def mod_file(self, mod_id: str, filename: str) -> Path:
        """Return the path to a per-mod sidecar file (`<mod_dir>/<filename>`).

        Args:
            mod_id: The mod the file belongs to.
            filename: The sidecar file name (e.g. `"synced_keys.json"`).

        Returns:
            `<root>/mods/<mod_id>/<filename>`.
        """
        return self.mod_dir(mod_id) / filename
