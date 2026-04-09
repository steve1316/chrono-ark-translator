"""
Central configuration for the Chrono Ark Mod Translation program.

All settings can be overridden via environment variables prefixed with CATL_
(Chrono Ark TransLator).

Game-specific settings (paths, CSV schema, DLL skip lists, etc.) live in
the corresponding game adapter under games/<game_id>/adapter.py.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


# ── Paths ──────────────────────────────────────────────────────────────────────

# Local storage directory for extracted data, translations, and glossary.
STORAGE_PATH = Path(os.environ.get("CATL_STORAGE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")))

# ── API Keys ───────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("CATL_ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("CATL_OPENAI_API_KEY", "")
DEEPL_API_KEY = os.environ.get("CATL_DEEPL_API_KEY", "")

# ── Ollama Settings ───────────────────────────────────────────────────────────

OLLAMA_BASE_URL = os.environ.get("CATL_OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("CATL_OLLAMA_MODEL", "qwen2.5:7b")
OLLAMA_VRAM_TIER = os.environ.get("CATL_OLLAMA_VRAM_TIER", "")

# ── llama.cpp Settings ───────────────────────────────────────────────────────

LLAMACPP_BASE_URL = os.environ.get("CATL_LLAMACPP_BASE_URL", "http://localhost:8080")
LLAMACPP_MODEL = os.environ.get("CATL_LLAMACPP_MODEL", "")
LLAMACPP_BINARY_PATH = os.environ.get("CATL_LLAMACPP_BINARY_PATH", "llama-server")
LLAMACPP_MODEL_PATH = os.environ.get("CATL_LLAMACPP_MODEL_PATH", "")
LLAMACPP_GPU_LAYERS = int(os.environ.get("CATL_LLAMACPP_GPU_LAYERS", "-1"))
LLAMACPP_CTX_SIZE = int(os.environ.get("CATL_LLAMACPP_CTX_SIZE", "8192"))
LLAMACPP_VRAM_TIER = os.environ.get("CATL_LLAMACPP_VRAM_TIER", "")

# Directory for downloaded GGUF model files.
LLAMACPP_MODELS_DIR = Path(
    os.environ.get(
        "CATL_LLAMACPP_MODELS_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage", "models"),
    )
)

# ── Translation Settings ──────────────────────────────────────────────────────

# Default translation provider (claude, openai, deepl, ollama, manual).
TRANSLATION_PROVIDER = os.environ.get("CATL_TRANSLATION_PROVIDER", "claude")

# Number of strings to send per LLM API batch request.
# Claude Sonnet 4 supports 64K output tokens.
BATCH_SIZE = int(os.environ.get("CATL_BATCH_SIZE", "100"))

# Glossary categories to include in the translation prompt.
# Only these categories from the base glossary are sent to the LLM.
GLOSSARY_CATEGORIES = os.environ.get("CATL_GLOSSARY_CATEGORIES", "buffs,characters").split(",")

# ── Mod Filtering ─────────────────────────────────────────────────────────────

# Comma-separated list of workshop mod IDs to hide from the dashboard.
IGNORED_MODS: list[str] = [m.strip() for m in os.environ.get("CATL_IGNORED_MODS", "").split(",") if m.strip()]

# ── Game Selection ─────────────────────────────────────────────────────────────

# Active game adapter ID. See games/ directory for available adapters.
ACTIVE_GAME = os.environ.get("CATL_ACTIVE_GAME", "chrono_ark")
