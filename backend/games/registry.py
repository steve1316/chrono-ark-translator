"""
Game adapter registry.

Provides registration and lookup of game adapters by ID.
"""

from backend.games.base import GameAdapter
from backend.games.chrono_ark.adapter import ChronoArkAdapter

_ADAPTERS: dict[str, type[GameAdapter]] = {
    "chrono_ark": ChronoArkAdapter,
}


def register_adapter(game_id: str, adapter_class: type[GameAdapter]) -> None:
    """Register a game adapter class.

    Args:
        game_id: Unique identifier for the game (e.g. `"chrono_ark"`).
        adapter_class: The GameAdapter subclass to register.
    """
    _ADAPTERS[game_id] = adapter_class


def get_adapter(game_id: str) -> GameAdapter:
    """Create and return a game adapter instance by ID.

    Args:
        game_id: Unique identifier for the game.

    Returns:
        A new instance of the registered GameAdapter subclass.

    Raises:
        ValueError: If no adapter is registered for the given game_id.
    """
    if game_id not in _ADAPTERS:
        available = ", ".join(_ADAPTERS.keys()) or "(none)"
        raise ValueError(f"Unknown game: {game_id}. Available: {available}")
    return _ADAPTERS[game_id]()


def list_games() -> list[str]:
    """Return all registered game IDs.

    Returns:
        List of game identifier strings for all registered adapters.
    """
    return list(_ADAPTERS.keys())
