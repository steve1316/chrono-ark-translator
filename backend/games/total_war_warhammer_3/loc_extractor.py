"""Read and write `.loc.tsv` files for Total War: Warhammer III mods.

RPFM exports loc tables as TSV with two header lines:
  Line 0: literal header `key\ttext\ttooltip`
  Line 1: RPFM metadata `#Loc;1;text/<filename>.loc\t\t`
Lines 2+ are data rows.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LocRow:
    """One row from a `.loc.tsv` file.

    Attributes:
        key: Localization key (column 0).
        text: Translated or source text (column 1).
        tooltip: Whether this entry is shown as a tooltip (column 2).
    """

    key: str
    text: str
    tooltip: bool


def _parse_tooltip(value: str) -> bool:
    """Parse the tooltip column. Accepts `true` / `false` case-insensitively.

    Args:
        value: Raw string from the tooltip column.

    Returns:
        True if the value is `true` (case-insensitive), False otherwise.
    """
    return value.strip().lower() == "true"


def read_translation_loc_tsv(path: Path) -> dict[str, LocRow]:
    """Parse a `.loc.tsv` file into a dict keyed by loc key.

    Skips the literal header row and the RPFM `#Loc;1;...` metadata row.
    Whitespace-only `text` cells are preserved verbatim.

    Args:
        path: Filesystem path to the `.loc.tsv` file.

    Returns:
        Dictionary mapping `key` to `LocRow`.

    Raises:
        FileNotFoundError: If `path` does not exist.
    """
    if not path.exists():
        raise FileNotFoundError(f"loc.tsv not found: {path}")

    rows: dict[str, LocRow] = {}
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        for line_no, parts in enumerate(reader):
            if line_no == 0:
                continue  # header
            if not parts:
                continue
            if parts[0].startswith("#Loc"):
                continue  # RPFM metadata
            if len(parts) < 3:
                # malformed row - pad missing columns with empty strings
                parts = parts + [""] * (3 - len(parts))
            key, text, tooltip = parts[0], parts[1], parts[2]
            if not key:
                continue
            rows[key] = LocRow(key=key, text=text, tooltip=_parse_tooltip(tooltip))
    return rows
