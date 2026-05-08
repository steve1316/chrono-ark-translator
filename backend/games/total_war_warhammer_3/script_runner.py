"""Subprocess-based runner for the helper_scripts/update_*.py family.

Single-run lock, bounded stdout deque, daemon-thread reader. The skeleton
declares constants, dataclasses, exceptions, and module-level state. Lifecycle
methods (`start_run`, `current_run`, `cancel_run`, `stream_lines`) are added
by Tasks 4 and 5.
"""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
import threading
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import AsyncIterator


@dataclass(frozen=True)
class ScriptDef:
    """A registered helper_scripts entry: filename + CLI args."""

    filename: str
    """ The script filename within the helper_scripts directory. """
    args: list[str] = field(default_factory=list)
    """ CLI arguments passed to the script on each invocation. """


SCRIPT_REGISTRY: dict[str, ScriptDef] = {
    "update_dynamic_rors": ScriptDef("update_dynamic_rors.py", ["--reset"]),
    "update_dynamic_rors_vanilla": ScriptDef("update_dynamic_rors.py", ["--reset", "--vanilla"]),
    "update_double_unit_size": ScriptDef("update_double_unit_size.py", ["--reset"]),
    "update_modified_attribute_mods": ScriptDef("update_modified_attribute_mods.py", ["--reset"]),
    "process_main_units_tables": ScriptDef("process_main_units_tables.py", []),
    "update": ScriptDef("update.py", []),
}


class RunStatus(str, Enum):
    """Lifecycle state of the runner."""

    IDLE = "idle"
    RUNNING = "running"


@dataclass
class RunHandle:
    """In-memory record of the currently or most-recently running script.

    Set when `start_run` succeeds. `ended_at` and `exit_code` populate when the
    subprocess exits (including via cancel).
    """

    run_id: str
    """ Unique identifier for this run, generated at start time. """
    script_id: str
    """ Key from `SCRIPT_REGISTRY` identifying which script was launched. """
    started_at: datetime
    """ UTC timestamp when the subprocess was spawned. """
    ended_at: datetime | None = None
    """ UTC timestamp when the subprocess exited. `None` while still running. """
    exit_code: int | None = None
    """ Return code from the subprocess. `None` while still running. """


@dataclass
class _LogLine:
    """One stdout line from the running subprocess plus its capture timestamp."""

    line: str
    """ The raw text line captured from subprocess stdout. """
    ts: datetime
    """ UTC timestamp at which the line was captured. """


class RunnerError(Exception):
    """Base for runner errors."""


class RunInProgressError(RunnerError):
    """Raised when `start_run` is called while another run is active."""


class PreflightError(RunnerError):
    """Raised when `start_run` preflight checks fail.

    Attributes:
        missing: List of human-readable strings naming each failed check.
    """

    def __init__(self, missing: list[str]):
        super().__init__(f"preflight failed: {missing}")
        self.missing: list[str] = missing


class UnknownScriptError(RunnerError):
    """Raised when `start_run` is called with an unknown `script_id`."""


# Module-level state guarded by `_lock`. Accessed by `start_run`, `cancel_run`,
# `current_run`, `stream_lines`, and the daemon reader thread. All reads and
# writes outside the daemon thread go through `_lock`.
_lock = threading.Lock()
_current: RunHandle | None = None
_proc: subprocess.Popen | None = None
_log: "deque[_LogLine]" = deque(maxlen=5000)
_event_new_line = threading.Event()
