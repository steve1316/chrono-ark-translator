"""
Central configuration for the Chrono Ark Mod Translation program.

All settings can be overridden via environment variables prefixed with CATL_
(Chrono Ark TransLator).

Game-specific settings (paths, CSV schema, DLL skip lists, etc.) live in
the corresponding game adapter under games/<game_id>/adapter.py.
"""

import os
from pathlib import Path


# ── Paths ──────────────────────────────────────────────────────────────────────

# Local storage directory for extracted data, translations, and glossary.
STORAGE_PATH = Path(os.environ.get(
    "CATL_STORAGE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
))

# ── API Keys ───────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("CATL_ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("CATL_OPENAI_API_KEY", "")
DEEPL_API_KEY = os.environ.get("CATL_DEEPL_API_KEY", "")

# ── Translation Settings ──────────────────────────────────────────────────────

# Default translation provider (claude, openai, deepl, manual).
TRANSLATION_PROVIDER = os.environ.get("CATL_TRANSLATION_PROVIDER", "claude")

# Number of strings to send per LLM API batch request.
BATCH_SIZE = int(os.environ.get("CATL_BATCH_SIZE", "20"))

# Glossary categories to include in the translation prompt.
# Only these categories from the base glossary are sent to the LLM.
GLOSSARY_CATEGORIES = os.environ.get(
    "CATL_GLOSSARY_CATEGORIES", "buffs,characters"
).split(",")

# ── Game Selection ─────────────────────────────────────────────────────────────

# Active game adapter ID. See games/ directory for available adapters.
ACTIVE_GAME = os.environ.get("CATL_ACTIVE_GAME", "chrono_ark")
