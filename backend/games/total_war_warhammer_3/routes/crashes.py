"""HTTP routes for the TW3 crash debugger."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from backend.games.total_war_warhammer_3 import crash_watcher

router = APIRouter()


class _NotesUpdate(BaseModel):
    """Body for PUT /crashes/{id}/notes."""

    notes: str


@router.get("/crashes")
def get_crashes():
    """List all snapshot manifests.

    Raises:
        HTTPException(503): When TW3_HELPER_PATH is unset.

    Returns:
        `{"snapshots": [...]}` on success.
    """
    try:
        return {"snapshots": crash_watcher.list_snapshots()}
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=f"Crash watcher unavailable: {exc}")


@router.post("/crashes/capture")
def post_capture():
    """Trigger a manual snapshot.

    Raises:
        HTTPException(503): When TW3_HELPER_PATH is unset or APPDATA is missing.

    Returns:
        The manifest dict on success.
    """
    try:
        return crash_watcher.capture_snapshot(trigger="manual")
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=f"Crash watcher unavailable: {exc}")


@router.put("/crashes/{snapshot_id}/notes")
def put_notes(snapshot_id: str, payload: _NotesUpdate):
    """Update the `notes` field of a snapshot manifest.

    Args:
        snapshot_id: Folder name returned by `capture_snapshot`.
        payload: `{"notes": str}`.

    Raises:
        HTTPException(404): When the snapshot does not exist.
        HTTPException(503): When TW3_HELPER_PATH is unset.

    Returns:
        The updated manifest.
    """
    try:
        return crash_watcher.update_notes(snapshot_id, payload.notes)
    except crash_watcher.SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail=f"snapshot not found: {snapshot_id}")
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=f"Crash watcher unavailable: {exc}")


@router.delete("/crashes/{snapshot_id}", status_code=204)
def delete_crash(snapshot_id: str):
    """Remove a snapshot folder.

    Args:
        snapshot_id: Folder name returned by `capture_snapshot`.

    Raises:
        HTTPException(404): When the snapshot does not exist.
        HTTPException(503): When TW3_HELPER_PATH is unset.
    """
    try:
        crash_watcher.delete_snapshot(snapshot_id)
    except crash_watcher.SnapshotNotFoundError:
        raise HTTPException(status_code=404, detail=f"snapshot not found: {snapshot_id}")
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=f"Crash watcher unavailable: {exc}")
    return Response(status_code=204)


@router.post("/crashes/{snapshot_id}/reveal")
def reveal_crash(snapshot_id: str):
    """Open the snapshot folder in Windows Explorer.

    Args:
        snapshot_id: Folder name returned by `capture_snapshot`.

    Raises:
        HTTPException(404): When the snapshot does not exist.
        HTTPException(501): When not running on Windows.
        HTTPException(503): When TW3_HELPER_PATH is unset.

    Returns:
        `{"opened": str}` on success.
    """
    if not hasattr(os, "startfile"):
        raise HTTPException(status_code=501, detail="reveal is Windows-only")
    try:
        root = crash_watcher._debugging_root()
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=f"Crash watcher unavailable: {exc}")
    folder = root / snapshot_id
    if not folder.is_dir():
        raise HTTPException(status_code=404, detail=f"snapshot not found: {snapshot_id}")
    os.startfile(str(folder))  # type: ignore[attr-defined]
    return {"opened": str(folder)}


@router.post("/crashes/test-fire", status_code=202)
def post_test_fire():
    """Test-only: write a fresh `no_clean_exit` marker so the watcher fires.

    Raises:
        HTTPException(404): When `CATL_TW3_TEST_FIRE_ENABLED` is not set.
        HTTPException(503): When APPDATA is missing.

    Returns:
        `{"marker": str}` on success.
    """
    if not os.environ.get("CATL_TW3_TEST_FIRE_ENABLED"):
        raise HTTPException(status_code=404, detail="test-fire disabled")
    try:
        wh3 = crash_watcher._appdata_wh3()
    except crash_watcher.WatcherDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    logs = wh3 / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    marker = logs / "no_clean_exit"
    marker.write_text("test-fire", encoding="utf-8")
    return {"marker": str(marker)}
