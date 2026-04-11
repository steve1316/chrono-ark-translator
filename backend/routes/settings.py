"""Settings and stats API endpoints for the Chrono Ark Translator."""

from fastapi import APIRouter, HTTPException

from backend import config
from backend.process_manager import is_managed
from backend.data.translation_memory import TranslationMemory
from backend.data.progress_tracker import ProgressTracker
from backend.routes.helpers import _adapter, _mask_key, _update_env_file
from backend.routes.models import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/api")


@router.get("/game")
async def get_game_info():
    """Return metadata about the active game adapter.

    Returns:
        A dict containing `game_id` and `game_name` for the currently
        configured game.
    """
    return {
        "game_id": _adapter.game_id,
        "game_name": _adapter.game_name,
    }


@router.get("/settings")
async def get_settings():
    """Return current provider, batch size, masked API key status, and Ollama settings.

    Returns:
        A `SettingsResponse` with all current configuration values.
    """
    return SettingsResponse(
        provider=config.TRANSLATION_PROVIDER,
        batch_size=config.BATCH_SIZE,
        anthropic_api_key_set=_mask_key(config.ANTHROPIC_API_KEY),
        openai_api_key_set=_mask_key(config.OPENAI_API_KEY),
        deepl_api_key_set=_mask_key(config.DEEPL_API_KEY),
        ollama_base_url=config.OLLAMA_BASE_URL,
        ollama_model=config.OLLAMA_MODEL,
        ollama_vram_tier=config.OLLAMA_VRAM_TIER,
        ollama_status="unknown",
        llamacpp_base_url=config.LLAMACPP_BASE_URL,
        llamacpp_model=config.LLAMACPP_MODEL,
        llamacpp_binary_path=config.LLAMACPP_BINARY_PATH,
        llamacpp_model_path=config.LLAMACPP_MODEL_PATH,
        llamacpp_gpu_layers=config.LLAMACPP_GPU_LAYERS,
        llamacpp_ctx_size=config.LLAMACPP_CTX_SIZE,
        llamacpp_vram_tier=config.LLAMACPP_VRAM_TIER,
        ollama_managed=is_managed("ollama"),
        llamacpp_managed=is_managed("llamacpp"),
        ignored_mods=config.IGNORED_MODS,
    )


@router.post("/settings")
async def update_settings(payload: SettingsUpdate):
    """Update provider, batch size, and/or API keys. Persists to .env."""
    env_updates: dict[str, str] = {}

    if payload.provider is not None:
        if payload.provider not in ("claude", "openai", "deepl", "ollama", "llamacpp", "manual"):
            raise HTTPException(400, f"Invalid provider: {payload.provider}")
        config.TRANSLATION_PROVIDER = payload.provider
        env_updates["CATL_TRANSLATION_PROVIDER"] = payload.provider

    if payload.batch_size is not None:
        if payload.batch_size < 1:
            raise HTTPException(400, "Batch size must be >= 1")
        config.BATCH_SIZE = payload.batch_size
        env_updates["CATL_BATCH_SIZE"] = str(payload.batch_size)

    if payload.anthropic_api_key is not None:
        config.ANTHROPIC_API_KEY = payload.anthropic_api_key
        env_updates["CATL_ANTHROPIC_API_KEY"] = payload.anthropic_api_key

    if payload.openai_api_key is not None:
        config.OPENAI_API_KEY = payload.openai_api_key
        env_updates["CATL_OPENAI_API_KEY"] = payload.openai_api_key

    if payload.deepl_api_key is not None:
        config.DEEPL_API_KEY = payload.deepl_api_key
        env_updates["CATL_DEEPL_API_KEY"] = payload.deepl_api_key

    if payload.ollama_base_url is not None:
        config.OLLAMA_BASE_URL = payload.ollama_base_url
        env_updates["CATL_OLLAMA_BASE_URL"] = payload.ollama_base_url

    if payload.ollama_model is not None:
        config.OLLAMA_MODEL = payload.ollama_model
        env_updates["CATL_OLLAMA_MODEL"] = payload.ollama_model

    if payload.ollama_vram_tier is not None:
        config.OLLAMA_VRAM_TIER = payload.ollama_vram_tier
        env_updates["CATL_OLLAMA_VRAM_TIER"] = payload.ollama_vram_tier

    if payload.llamacpp_base_url is not None:
        config.LLAMACPP_BASE_URL = payload.llamacpp_base_url
        env_updates["CATL_LLAMACPP_BASE_URL"] = payload.llamacpp_base_url

    if payload.llamacpp_model is not None:
        config.LLAMACPP_MODEL = payload.llamacpp_model
        env_updates["CATL_LLAMACPP_MODEL"] = payload.llamacpp_model

    if payload.llamacpp_binary_path is not None:
        config.LLAMACPP_BINARY_PATH = payload.llamacpp_binary_path
        env_updates["CATL_LLAMACPP_BINARY_PATH"] = payload.llamacpp_binary_path

    if payload.llamacpp_model_path is not None:
        config.LLAMACPP_MODEL_PATH = payload.llamacpp_model_path
        env_updates["CATL_LLAMACPP_MODEL_PATH"] = payload.llamacpp_model_path

    if payload.llamacpp_gpu_layers is not None:
        config.LLAMACPP_GPU_LAYERS = payload.llamacpp_gpu_layers
        env_updates["CATL_LLAMACPP_GPU_LAYERS"] = str(payload.llamacpp_gpu_layers)

    if payload.llamacpp_ctx_size is not None:
        config.LLAMACPP_CTX_SIZE = payload.llamacpp_ctx_size
        env_updates["CATL_LLAMACPP_CTX_SIZE"] = str(payload.llamacpp_ctx_size)

    if payload.llamacpp_vram_tier is not None:
        config.LLAMACPP_VRAM_TIER = payload.llamacpp_vram_tier
        env_updates["CATL_LLAMACPP_VRAM_TIER"] = payload.llamacpp_vram_tier

    if payload.ignored_mods is not None:
        config.IGNORED_MODS = payload.ignored_mods
        env_updates["CATL_IGNORED_MODS"] = ",".join(payload.ignored_mods)

    if env_updates:
        _update_env_file(env_updates)

    return await get_settings()


@router.get("/stats")
async def get_stats():
    """Get global statistics for translation memory and progress.

    Returns:
        A dict with `tm_entries` (translation memory size), `tm_hits`
        (session cache hits), `total_mods`, `global_progress`
        (percentage), and `total_strings` across all mods.
    """
    tm = TranslationMemory()
    stats = tm.get_stats()

    # Also count total mods and translation progress
    tracker = ProgressTracker()
    mods = _adapter.scan_mods()

    total_strings = 0
    total_translated = 0

    for mod in mods:
        status = tracker.get_status(mod.mod_id)
        total_strings += status["total"]
        total_translated += status["translated"]

    return {
        "tm_entries": stats["total_entries"],
        "tm_hits": stats["session_hits"],
        "total_mods": len(mods),
        "global_progress": round((total_translated / total_strings * 100), 2) if total_strings > 0 else 0,
        "total_strings": total_strings,
    }
