"""Live importlib-based loader for the helper_scripts registry constants.

Reads `SUPPORTED_MODS` from `supported_mods.py` and `SUPPORTED_EFFECTS` from
`dynamic_rors_effects.py`. The registry files may import sibling modules in
the same directory (e.g. `from utilities import STEAM_LIBRARY_DRIVE`), so the
loader prepends the helper_scripts directory to `sys.path` for the duration
of the import and restores it afterwards. Errors surface as typed exceptions
for the route layer to translate into HTTP responses.
"""

from __future__ import annotations

import importlib.util
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


@contextmanager
def _sys_path_prepended(directory: Path) -> Iterator[None]:
    """Prepend `directory` to `sys.path` for the duration of the context.

    Args:
        directory: Path to insert at index 0 of `sys.path`.
    """
    entry = str(directory)
    sys.path.insert(0, entry)
    try:
        yield
    finally:
        try:
            sys.path.remove(entry)
        except ValueError:
            pass


class HelperScriptsLoaderError(Exception):
    """Base for all loader errors."""


class HelperScriptsNotConfiguredError(HelperScriptsLoaderError):
    """The configured `helper_scripts_path` is unset or does not exist on disk."""


class RegistryFileMissingError(HelperScriptsLoaderError):
    """The expected .py file is not present in the configured directory."""


class RegistryConstantNotFoundError(HelperScriptsLoaderError):
    """The .py file loaded but does not declare the expected constant."""


class RegistryFileSyntaxError(HelperScriptsLoaderError):
    """The .py file failed to compile."""


def _load_constant(helper_scripts_path: Path, filename: str, constant: str) -> Any:
    """Live-import `filename` from `helper_scripts_path` and return its `constant` attribute.

    Args:
        helper_scripts_path: Configured `helper_scripts/` directory.
        filename: The .py file to import (e.g. 'supported_mods.py').
        constant: The module-level constant to read (e.g. 'SUPPORTED_MODS').

    Raises:
        HelperScriptsNotConfiguredError: When `helper_scripts_path` is missing.
        RegistryFileMissingError: When `filename` is not present.
        RegistryFileSyntaxError: When the file fails to compile.
        RegistryConstantNotFoundError: When the constant is not declared.

    Returns:
        The value of the named constant.
    """
    if not helper_scripts_path or not helper_scripts_path.is_dir():
        raise HelperScriptsNotConfiguredError(str(helper_scripts_path))

    target = helper_scripts_path / filename
    if not target.is_file():
        raise RegistryFileMissingError(str(target))

    spec = importlib.util.spec_from_file_location(f"_helper_scripts_{filename}", target)
    if spec is None or spec.loader is None:
        raise RegistryFileSyntaxError(f"could not build module spec for {target}")

    module = importlib.util.module_from_spec(spec)
    try:
        with _sys_path_prepended(helper_scripts_path):
            spec.loader.exec_module(module)
    except SyntaxError as exc:
        raise RegistryFileSyntaxError(str(exc)) from exc

    if not hasattr(module, constant):
        raise RegistryConstantNotFoundError(f"{filename} has no '{constant}' attribute")
    return getattr(module, constant)


def load_supported_mods(helper_scripts_path: Path) -> list[dict]:
    """Live-import `SUPPORTED_MODS` from `supported_mods.py` in the given directory.

    Args:
        helper_scripts_path: Configured `helper_scripts/` directory.

    Raises:
        HelperScriptsNotConfiguredError: When `helper_scripts_path` is missing or not a directory.
        RegistryFileMissingError: When `supported_mods.py` is absent.
        RegistryFileSyntaxError: When the file fails to compile.
        RegistryConstantNotFoundError: When `SUPPORTED_MODS` is not declared.

    Returns:
        The `SUPPORTED_MODS` list of dicts.
    """
    return _load_constant(helper_scripts_path, "supported_mods.py", "SUPPORTED_MODS")


def load_supported_effects(helper_scripts_path: Path) -> dict:
    """Live-import `SUPPORTED_EFFECTS` from `dynamic_rors_effects.py` in the given directory.

    Args:
        helper_scripts_path: Configured `helper_scripts/` directory.

    Raises:
        HelperScriptsNotConfiguredError: When `helper_scripts_path` is missing or not a directory.
        RegistryFileMissingError: When `dynamic_rors_effects.py` is absent.
        RegistryFileSyntaxError: When the file fails to compile.
        RegistryConstantNotFoundError: When `SUPPORTED_EFFECTS` is not declared.

    Returns:
        The `SUPPORTED_EFFECTS` dict.
    """
    return _load_constant(helper_scripts_path, "dynamic_rors_effects.py", "SUPPORTED_EFFECTS")
