"""Total War: Warhammer III adapter.

Composes the TW3 read-only registry routes under
`/api/games/total_war_warhammer_3`. Runner routes will be added by Task 6.
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.games.base import GameAdapter


class TotalWarWarhammer3Adapter(GameAdapter):
    """Total War: Warhammer III game adapter. Registry routes are live; runner routes will be added in Task 6."""

    _ROUTER: APIRouter | None = None

    @property
    def game_id(self) -> str:
        return "total_war_warhammer_3"

    @property
    def display_name(self) -> str:
        return "Warhammer III"

    @property
    def icon(self) -> str:
        return "total_war_warhammer_3"

    @property
    def capabilities(self) -> list[str]:
        return []

    @property
    def router(self) -> APIRouter:
        """Return the composed adapter router for Total War: Warhammer III.

        Cached at class level: the composed router has no instance dependencies.

        Returns:
            Cached composed `APIRouter` for the TW3 game.
        """
        if TotalWarWarhammer3Adapter._ROUTER is None:
            from backend.games.total_war_warhammer_3.routes import build_total_war_warhammer_3_router

            TotalWarWarhammer3Adapter._ROUTER = build_total_war_warhammer_3_router()
        return TotalWarWarhammer3Adapter._ROUTER

    @property
    def settings_schema(self) -> dict[str, dict]:
        return {
            "helper_scripts_path": {"type": "str", "default": ""},
            "rpfm_cli_path": {"type": "str", "default": ""},
            "steam_library_drive": {"type": "str", "default": "F:"},
        }
