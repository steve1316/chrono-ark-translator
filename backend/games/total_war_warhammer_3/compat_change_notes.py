"""Bridge to totalwar-modding's Workshop change notes for WH3 compat packs.

Runs `python -m publish.change_notes` inside the helper_scripts directory, because its publish state paths are relative to that folder. The note logic stays in totalwar-modding so `update.py` and the app always agree.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from backend import config
from backend.games.total_war_warhammer_3.routes._paths import helper_scripts_path

# `preview` hashes each pack, which can take a while for large packs.
PREVIEW_TIMEOUT_SECONDS = 60
RECORD_TIMEOUT_SECONDS = 30


class ChangeNoteError(Exception):
    """Raised when the change note CLI cannot be run or returns something unusable."""


def _run_cli(args: list[str], timeout: int) -> str:
    """Run the change note CLI from the helper_scripts directory and return its stdout.

    Args:
        args: Arguments after `python -m publish.change_notes`.
        timeout: Seconds to wait before giving up.

    Returns:
        The captured stdout.

    Raises:
        ChangeNoteError: When helper_scripts is not configured, the CLI cannot start or times out, or it exits non-zero.
    """
    helper = helper_scripts_path()
    if not config.TW3_HELPER_PATH or not helper.is_dir():
        raise ChangeNoteError("helper_scripts path is not configured")
    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "publish.change_notes", *args],
            cwd=str(helper),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env={**os.environ, "STEAM_LIBRARY_DRIVE": config.TW3_STEAM_LIBRARY_DRIVE or ""},
            creationflags=creationflags,
        )
    except subprocess.TimeoutExpired:
        raise ChangeNoteError(f"change note script timed out after {timeout}s")
    except OSError as exc:
        raise ChangeNoteError(f"could not run the change note script: {exc}")
    if proc.returncode != 0:
        lines = [line for line in (proc.stderr or "").splitlines() if line.strip()]
        raise ChangeNoteError(lines[-1] if lines else f"change note script exited with code {proc.returncode}")
    return proc.stdout or ""


def preview(ids: list[str]) -> dict[str, dict | None]:
    """Fetch the note each compat pack would be uploaded with right now.

    Args:
        ids: Workshop ids of the compat packs.

    Returns:
        Each id mapped to `{"note", "pack_sha", "pending"}`, or None when it is not a generated pack or its pack file is missing.

    Raises:
        ChangeNoteError: When the CLI fails or does not print a JSON object.
    """
    if not ids:
        return {}
    stdout = _run_cli(["preview", *ids], PREVIEW_TIMEOUT_SECONDS)
    # Helper imports may print before the JSON, so only the last non-empty line is parsed.
    lines = [line for line in stdout.splitlines() if line.strip()]
    try:
        data = json.loads(lines[-1]) if lines else None
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise ChangeNoteError("change note script did not print a JSON object")
    return {wid: data.get(wid) for wid in ids}


def record(workshop_id: str, pack_sha: str, note: str) -> None:
    """Record a successful compat pack upload in totalwar-modding's publish state.

    The note goes through a UTF-8 temp file so multi-line text with quotes and non-ASCII characters survives intact.

    Args:
        workshop_id: Workshop id of the uploaded pack.
        pack_sha: SHA-256 of the pack captured when the upload started.
        note: The changenote sent with the upload.

    Raises:
        ChangeNoteError: When the CLI fails.
    """
    fd, path = tempfile.mkstemp(prefix=f"changenote_{workshop_id}_", suffix=".txt")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(note)
        _run_cli(["record", workshop_id, "--pack-sha", pack_sha, "--note-file", path], RECORD_TIMEOUT_SECONDS)
    finally:
        Path(path).unlink(missing_ok=True)
