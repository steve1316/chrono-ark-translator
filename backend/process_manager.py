"""
Process manager for locally-spawned LLM server processes.

Tracks subprocess.Popen objects by name so the web server can start/stop
Ollama and llama-server without external service managers.
"""

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Module-level registry: name -> (Popen, stdout_file, stderr_file)
_processes: dict[str, tuple[subprocess.Popen, object, object]] = {}


def is_managed(name: str) -> bool:
    """Return True if we spawned and are tracking a live process by this name."""
    entry = _processes.get(name)
    if entry is None:
        return False
    proc = entry[0]
    if proc.poll() is not None:
        _cleanup(name)
        return False
    return True


def start_process(name: str, args: list[str], log_dir: Path) -> tuple[bool, str]:
    """Start a background process and track it.

    Args:
        name: Registry key (e.g. `"ollama"`, `"llamacpp"`).
        args: Command + arguments list for `subprocess.Popen`.
        log_dir: Directory to write stdout/stderr log files.

    Returns:
        `(success, message)` tuple.
    """
    if is_managed(name):
        return False, f"{name} is already running (managed by this app)."

    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_log = open(log_dir / f"{name}_stdout.log", "w")
    stderr_log = open(log_dir / f"{name}_stderr.log", "w")

    try:
        proc = subprocess.Popen(
            args,
            stdout=stdout_log,
            stderr=stderr_log,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        _processes[name] = (proc, stdout_log, stderr_log)
        logger.info("Started %s (PID %d): %s", name, proc.pid, args)
        return True, f"Started {name} (PID {proc.pid})."
    except FileNotFoundError:
        stdout_log.close()
        stderr_log.close()
        return False, f"Binary not found: {args[0]}"
    except Exception as e:
        stdout_log.close()
        stderr_log.close()
        return False, f"Failed to start {name}: {e}"


def stop_process(name: str) -> tuple[bool, str]:
    """Stop a managed process by name.

    Args:
        name: Registry key of the process to stop.

    Returns:
        `(success, message)` tuple.
    """
    entry = _processes.get(name)
    if entry is None:
        return False, f"{name} was not started by this app."

    proc = entry[0]
    if proc.poll() is not None:
        _cleanup(name)
        return False, f"{name} already exited (code {proc.returncode})."

    try:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)
        _cleanup(name)
        logger.info("Stopped %s", name)
        return True, f"Stopped {name}."
    except Exception as e:
        return False, f"Failed to stop {name}: {e}"


def _cleanup(name: str) -> None:
    """Remove a process from the registry and close its log file handles."""
    entry = _processes.pop(name, None)
    if entry is None:
        return
    _, stdout_log, stderr_log = entry
    try:
        stdout_log.close()
    except Exception:
        pass
    try:
        stderr_log.close()
    except Exception:
        pass
