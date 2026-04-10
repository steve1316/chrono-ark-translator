"""
Manages history backups for mod translation data.

Creates timestamped snapshots before destructive operations so the user
can restore previous states. Each backup captures translations.json,
glossary.json, pending_suggestions.json, and sync state files.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from backend import config


def _history_dir(mod_id: str, storage_path: Optional[Path] = None) -> Path:
    """Return the history directory for a mod, creating it if needed."""
    base = storage_path or config.STORAGE_PATH
    path = base / "mods" / mod_id / "history"
    path.mkdir(parents=True, exist_ok=True)
    return path


def create_backup(mod_id: str, reason: str, storage_path: Optional[Path] = None) -> Optional[str]:
    """Create a timestamped backup of the mod's current state.

    Args:
        mod_id: The mod's Workshop ID.
        reason: Human-readable description of why the backup was created
            (e.g. "Before clearing translations", "Before translation run").
        storage_path: Base storage path override.

    Returns:
        The backup ID (timestamp string), or None if there was nothing to back up.
    """
    base = storage_path or config.STORAGE_PATH
    mod_dir = base / "mods" / mod_id

    # Only back up if there's meaningful data
    translations_path = mod_dir / "translations.json"
    if not translations_path.exists():
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = _history_dir(mod_id, storage_path) / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Copy files that exist
    files_to_backup = [
        "translations.json",
        "glossary.json",
        "pending_suggestions.json",
        "progress.json",
        "synced_keys.json",
        "pre_export_english.json",
    ]
    backed_up = False
    for filename in files_to_backup:
        src = mod_dir / filename
        if src.exists():
            shutil.copy2(src, backup_dir / filename)
            backed_up = True

    if not backed_up:
        shutil.rmtree(backup_dir)
        return None

    # Save metadata
    meta = {
        "timestamp": timestamp,
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "files": [f for f in files_to_backup if (mod_dir / f).exists()],
    }
    with open(backup_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    # Prune old backups (keep last 20)
    _prune_backups(mod_id, max_backups=20, storage_path=storage_path)

    return timestamp


def list_backups(mod_id: str, storage_path: Optional[Path] = None) -> list[dict]:
    """List all available backups for a mod, newest first.

    Args:
        mod_id: The mod's Workshop ID.
        storage_path: Base storage path override.

    Returns:
        List of backup metadata dicts with id, reason, created_at, and files.
    """
    hist_dir = _history_dir(mod_id, storage_path)
    backups = []
    for entry in sorted(hist_dir.iterdir(), reverse=True):
        if entry.is_dir():
            meta_path = entry / "meta.json"
            if meta_path.exists():
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                meta["id"] = entry.name
                backups.append(meta)
    return backups


def restore_backup(mod_id: str, backup_id: str, storage_path: Optional[Path] = None) -> bool:
    """Restore a mod's state from a backup.

    Creates a backup of the current state first (reason: "Before restore"),
    then copies all backed-up files into the mod directory.

    Args:
        mod_id: The mod's Workshop ID.
        backup_id: The timestamp ID of the backup to restore.
        storage_path: Base storage path override.

    Returns:
        True if the restore was successful, False if the backup was not found.
    """
    base = storage_path or config.STORAGE_PATH
    backup_dir = _history_dir(mod_id, storage_path) / backup_id

    if not backup_dir.exists():
        return False

    # Create a backup of current state before restoring
    create_backup(mod_id, f"Before restore to {backup_id}", storage_path)

    mod_dir = base / "mods" / mod_id
    meta_path = backup_dir / "meta.json"
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        backed_up_files = set(meta.get("files", []))
        for filename in backed_up_files:
            src = backup_dir / filename
            if src.exists():
                shutil.copy2(src, mod_dir / filename)

        # Remove sync state files that weren't in the backup so stale
        # data from the current state doesn't persist after restore.
        for sync_file in ("synced_keys.json", "pre_export_english.json"):
            if sync_file not in backed_up_files:
                target = mod_dir / sync_file
                if target.exists():
                    target.unlink()

    return True


def delete_backup(mod_id: str, backup_id: str, storage_path: Optional[Path] = None) -> bool:
    """Delete a specific backup.

    Args:
        mod_id: The mod's Workshop ID.
        backup_id: The timestamp ID of the backup to delete.
        storage_path: Base storage path override.

    Returns:
        True if the backup was deleted, False if it was not found.
    """
    backup_dir = _history_dir(mod_id, storage_path) / backup_id
    if not backup_dir.exists():
        return False
    shutil.rmtree(backup_dir)
    return True


def _prune_backups(mod_id: str, max_backups: int = 20, storage_path: Optional[Path] = None) -> None:
    """Remove oldest backups if exceeding the limit."""
    hist_dir = _history_dir(mod_id, storage_path)
    entries = sorted([e for e in hist_dir.iterdir() if e.is_dir()], reverse=True)
    for old_entry in entries[max_backups:]:
        shutil.rmtree(old_entry)
