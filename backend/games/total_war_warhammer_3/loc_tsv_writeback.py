"""Surgical writeback from `translations.json` into user `.loc.tsv` files.

The strategy preserves the user's existing row ordering, blank lines, RPFM
metadata header, and any rows we don't have translations for. For each
`(key, text)` patch:
  * If the key already exists in the file, replace column 1 (the text column)
    on its row. Column 2 (`tooltip`) is preserved verbatim.
  * If the key is new, append a row `key\\ttext\\ttrue` at the end.
If the target file does not exist, create it with the standard header +
RPFM metadata line, then append rows.
"""

from __future__ import annotations

from pathlib import Path


def read_loc_tsv_lines(path: Path) -> list[str]:
    """Read a `.loc.tsv` file as a list of lines (no trailing newline).

    Args:
        path: Filesystem path to the `.loc.tsv` file.

    Returns:
        List of line strings.
    """
    return path.read_text(encoding="utf-8").splitlines()


def _new_loc_tsv_skeleton(path: Path) -> list[str]:
    """Build the two-line header for a brand-new `.loc.tsv` file.

    Args:
        path: Filesystem path the file will be written to. Used to derive the
            RPFM metadata line's `text/<stem>.loc` reference.

    Returns:
        Two-line list: `["key\\ttext\\ttooltip", "#Loc;1;text/<stem>.loc\\t\\t"]`.
    """
    stem = path.name
    if stem.endswith(".loc.tsv"):
        stem = stem[: -len(".loc.tsv")]
    elif stem.endswith(".tsv"):
        stem = stem[: -len(".tsv")]
    return ["key\ttext\ttooltip", f"#Loc;1;text/{stem}.loc\t\t"]


def apply_row_patches(path: Path, patches: dict[str, str]) -> None:
    """Surgically apply translation patches to a `.loc.tsv` file.

    For each `(key, new_text)` in `patches`:
      * If `key` already exists in the file, replace column 1 (text) on that
        row, preserving column 2 (tooltip) and the rest of the file verbatim.
      * Otherwise, append `key\\t<new_text>\\ttrue` at the end.

    If the file does not exist, it is created with the standard 2-line header
    before patches are appended.

    Args:
        path: Filesystem path to the `.loc.tsv` file to patch.
        patches: Mapping of loc key to new translated text.
    """
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = _new_loc_tsv_skeleton(path)
    else:
        lines = read_loc_tsv_lines(path)

    remaining = dict(patches)
    for i, line in enumerate(lines):
        if i < 2:
            continue
        if not line or line.startswith("#"):
            continue
        first_tab = line.find("\t")
        if first_tab < 0:
            continue
        key = line[:first_tab]
        if key in remaining:
            second_tab = line.find("\t", first_tab + 1)
            tooltip = line[second_tab + 1:] if second_tab >= 0 else "true"
            lines[i] = f"{key}\t{remaining[key]}\t{tooltip}"
            remaining.pop(key)

    for key, text in remaining.items():
        lines.append(f"{key}\t{text}\ttrue")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
