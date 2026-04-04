"""
Game adapter registry.

Provides registration and lookup of game adapters by ID.
"""

from games.base import GameAdapter

_ADAPTERS: dict[str, type[GameAdapter]] = {}


def register_adapter(game_id: str, adapter_class: type[GameAdapter]) -> None:
    """Register a game adapter class."""
    _ADAPTERS[game_id] = adapter_class


def get_adapter(game_id: str) -> GameAdapter:
    """Create and return a game adapter instance by ID."""
    if game_id not in _ADAPTERS:
        available = ", ".join(_ADAPTERS.keys()) or "(none)"
        raise ValueError(f"Unknown game: {game_id}. Available: {available}")
    return _ADAPTERS[game_id]()


def list_games() -> list[str]:
    """Return all registered game IDs."""
    return list(_ADAPTERS.keys())
