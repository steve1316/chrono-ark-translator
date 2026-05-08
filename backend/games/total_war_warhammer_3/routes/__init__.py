"""HTTP routers owned by the Total War: Warhammer III adapter."""

from fastapi import APIRouter

from backend.games.total_war_warhammer_3.routes import registry, runner


def build_total_war_warhammer_3_router() -> APIRouter:
    """Compose the TW3 sub-routers under `/api/games/total_war_warhammer_3`.

    Returns:
        Composed `APIRouter` with the per-game prefix applied.
    """
    composed = APIRouter(prefix="/api/games/total_war_warhammer_3")
    composed.include_router(registry.router)
    composed.include_router(runner.router)
    return composed
