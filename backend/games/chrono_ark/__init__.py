"""Chrono Ark game adapter."""

from games.registry import register_adapter
from games.chrono_ark.adapter import ChronoArkAdapter

register_adapter("chrono_ark", ChronoArkAdapter)
