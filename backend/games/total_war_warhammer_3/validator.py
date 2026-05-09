"""FK (foreign-key) validator for the TW3 mod registry."""

from pathlib import Path
from typing import Literal, TypedDict


class Issue(TypedDict):
    """One broken cross-reference flagged by `validate_registries`.

    Fields:
        kind: Discriminates the two check types.
        severity: Always 'error'; exists for forward compatibility.
        mod_package_name: Stable identity key for the mod.
        mod_name: Human-readable display name for the mod.
        target: The bad reference itself - the missing effect category name or the missing path string.
        message: One-line human description suitable for direct UI display.
    """

    kind: Literal["missing_effect_category", "missing_mod_path"]
    severity: Literal["error"]
    mod_package_name: str
    mod_name: str
    target: str
    message: str


def _is_file_safe(path: str) -> bool:
    """Return True if `path` points to an existing file, False for any other outcome.

    Wraps `Path.is_file()` in a broad OSError catch so no filesystem exception
    can propagate out of the validator.

    @param path: The filesystem path string to check.
    @returns: True if the file exists, False otherwise.
    """
    try:
        return Path(path).is_file()
    except OSError:
        return False


def validate_registries(mods: list[dict], effects: dict) -> list[Issue]:
    """Validate cross-references in the mod and effects registries.

    For each mod, runs two checks in order:
    1. If `modified_attributes` is present and non-empty, each entry that is not a key
       in `effects` produces a `missing_effect_category` issue.
    2. If `path` is missing, None, or empty, produces a `missing_mod_path` issue with
       `target=""`. Otherwise, if the path does not exist on disk, produces a
       `missing_mod_path` issue with `target=path`.

    @param mods: List of mod dicts as returned by `load_supported_mods`.
    @param effects: Dict of effect categories as returned by `load_supported_effects`.
    @returns: List of `Issue` dicts sorted by `(mod_name, kind, target)`.
    """
    issues: list[Issue] = []

    for mod in mods:
        mod_package_name: str = mod.get("package_name", "")
        mod_name: str = mod.get("name", "")

        # Category check.
        modified_attributes = mod.get("modified_attributes")
        if modified_attributes:
            for entry in modified_attributes:
                category = str(entry)
                if category not in effects:
                    issues.append(
                        Issue(
                            kind="missing_effect_category",
                            severity="error",
                            mod_package_name=mod_package_name,
                            mod_name=mod_name,
                            target=category,
                            message=f"modified_attributes references '{category}' but no such category exists in SUPPORTED_EFFECTS",
                        )
                    )

        # Path check.
        path = mod.get("path")
        if not path:
            issues.append(
                Issue(
                    kind="missing_mod_path",
                    severity="error",
                    mod_package_name=mod_package_name,
                    mod_name=mod_name,
                    target="",
                    message="path field is missing or empty",
                )
            )
        elif not _is_file_safe(path):
            issues.append(
                Issue(
                    kind="missing_mod_path",
                    severity="error",
                    mod_package_name=mod_package_name,
                    mod_name=mod_name,
                    target=path,
                    message=f"path '{path}' does not exist on disk",
                )
            )

    return sorted(issues, key=lambda i: (i["mod_name"], i["kind"], i["target"]))
