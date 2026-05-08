"""Total War: Warhammer III adapter — sub-project 1 stub.

Registers chassis metadata only. Pack-assembly capability and routes are
added in sub-project 2.
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.games.base import GameAdapter


class TotalWarWarhammer3Adapter(GameAdapter):
    """Empty-capability stub used to verify chassis registration end-to-end."""

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
        if TotalWarWarhammer3Adapter._ROUTER is None:
            TotalWarWarhammer3Adapter._ROUTER = APIRouter(prefix="/api/games/total_war_warhammer_3")
        return TotalWarWarhammer3Adapter._ROUTER

    @property
    def settings_schema(self) -> dict[str, dict]:
        return {
            "helper_scripts_path": {"type": "str", "default": ""},
            "rpfm_cli_path": {"type": "str", "default": ""},
            "steam_library_drive": {"type": "str", "default": "F:"},
        }
