"""Diff WH3 translation `.loc.tsv` files against parent-mod source strings.

The drift snapshot stores SHA-256 hashes of parent source text per
`(filename, key)`. On rescan, a key is `stale` if the current parent text
hashes to a value different from the snapshot. Keys present only in the
translation are `orphan`; keys present only in the parent are `untranslated`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

from backend.games.total_war_warhammer_3.loc_extractor import LocRow

DriftStatus = Literal["translated", "untranslated", "stale", "orphan"]


@dataclass(frozen=True)
class DriftRow:
    """One row in the drift report.

    Attributes:
        source_filename: Normalized parent `.loc.tsv` filename this row belongs to.
        key: Localization key.
        parent_text: Current parent source text, or `None` for orphan rows.
        translation_text: Current translation text, or `None` for untranslated rows.
        status: One of `translated`, `untranslated`, `stale`, `orphan`.
        provider: Who/what produced the current translation - `"claude"`, `"manual"`,
            or `None` when the row is untranslated. Defaults to `None`.
    """

    source_filename: str
    key: str
    parent_text: str | None
    translation_text: str | None
    status: DriftStatus
    provider: str | None = None


def hash_text(text: str) -> str:
    """Return the SHA-256 hex digest of `text` (UTF-8 encoded).

    Args:
        text: The string to hash.

    Returns:
        64-character lowercase hex string of the SHA-256 digest.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compute_drift(
    *,
    parent: dict[str, dict[str, LocRow]],
    translation: dict[str, dict[str, LocRow]],
    snapshot: dict[str, dict[str, str]],
) -> list[DriftRow]:
    """Compute per-row drift status.

    Args:
        parent: `{filename: {key: LocRow}}` extracted from the parent `.pack`.
        translation: `{filename: {key: LocRow}}` parsed from the user's local
            translation `.loc.tsv` files.
        snapshot: `{filename: {key: sha256_hex}}` recording the parent source
            text the user last saw / acted on.

    Returns:
        Sorted list of `DriftRow` (filename ascending, then key ascending).
    """
    rows: list[DriftRow] = []
    all_filenames = set(parent) | set(translation)

    for filename in all_filenames:
        parent_rows = parent.get(filename, {})
        translation_rows = translation.get(filename, {})
        snapshot_for_file = snapshot.get(filename, {})

        all_keys = set(parent_rows) | set(translation_rows)
        for key in all_keys:
            p_row = parent_rows.get(key)
            t_row = translation_rows.get(key)

            if p_row is None and t_row is not None:
                rows.append(DriftRow(filename, key, None, t_row.text, "orphan"))
                continue

            if t_row is None:
                rows.append(DriftRow(filename, key, p_row.text, None, "untranslated"))
                continue

            current_hash = hash_text(p_row.text)
            cached_hash = snapshot_for_file.get(key)

            if cached_hash is None or cached_hash == current_hash:
                rows.append(DriftRow(filename, key, p_row.text, t_row.text, "translated"))
            else:
                rows.append(DriftRow(filename, key, p_row.text, t_row.text, "stale"))

    rows.sort(key=lambda r: (r.source_filename, r.key))
    return rows
