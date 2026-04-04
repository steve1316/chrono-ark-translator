"""
Game adapter registry and plugin system.

Each supported game implements a GameAdapter that defines how to
discover mods, extract strings, export translations, and provide
game-specific context for LLM translation providers.
"""

# Import game modules to trigger adapter registration.
import games.chrono_ark  # noqa: F401
