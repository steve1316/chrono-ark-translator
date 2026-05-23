"""HTTP routes for TW3 Steam Workshop preview images served from disk."""

from __future__ import annotations

import json
import os
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from backend import config
from backend.games.total_war_warhammer_3 import workshop_publisher as wp
from backend.games.total_war_warhammer_3.routes._paths import tw3_workshop_content_dir

router = APIRouter()

_WORKSHOP_ID_RE = re.compile(r"^\d+$")
_IMAGE_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".webp")
_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


@router.get("/packs/{workshop_id}/preview")
def get_pack_preview(workshop_id: str):
    """Stream the first image file inside the local Steam Workshop folder for `workshop_id`.

    Args:
        workshop_id: Numeric Steam Workshop item id.

    Returns:
        `FileResponse` for the resolved image file.

    Raises:
        HTTPException(400): When `workshop_id` is not purely numeric.
        HTTPException(404): When the Steam library drive is unset, the workshop
            folder does not exist on disk, or no image file is found inside.
    """
    if not _WORKSHOP_ID_RE.fullmatch(workshop_id):
        raise HTTPException(status_code=400, detail="workshop_id must be numeric")

    folder = tw3_workshop_content_dir(workshop_id)
    if folder is None or not folder.is_dir():
        raise HTTPException(status_code=404, detail="workshop folder not found")

    # Sort entries for deterministic ordering when a folder contains multiple images.
    for entry in sorted(folder.iterdir()):
        if entry.is_file() and entry.suffix.lower() in _IMAGE_SUFFIXES:
            return FileResponse(entry, media_type=_MEDIA_TYPES[entry.suffix.lower()])

    raise HTTPException(status_code=404, detail="no preview image found")


@router.get("/packs/{workshop_id}/last_modified")
def get_pack_last_modified(workshop_id: str):
    """Return the newest mtime among files inside the local Workshop folder for `workshop_id`.

    Used by the TW3 Dashboard to surface "Updated Nh ago" beneath each pack card. The newest mtime across the
    folder's files captures the last time the user rebuilt or otherwise touched the pack on disk.

    Args:
        workshop_id: Numeric Steam Workshop item id.

    Returns:
        `{"last_modified_unix": float | None}` - the most recent mtime in the folder as a unix timestamp, or
        `None` when the folder is present but contains no files.

    Raises:
        HTTPException(400): When `workshop_id` is not purely numeric.
        HTTPException(404): When the Steam library drive is unset or the workshop folder does not exist on disk.
    """
    if not _WORKSHOP_ID_RE.fullmatch(workshop_id):
        raise HTTPException(status_code=400, detail="workshop_id must be numeric")

    folder = tw3_workshop_content_dir(workshop_id)
    if folder is None or not folder.is_dir():
        raise HTTPException(status_code=404, detail="workshop folder not found")

    newest: float | None = None
    for entry in folder.iterdir():
        if entry.is_file():
            mtime = entry.stat().st_mtime
            if newest is None or mtime > newest:
                newest = mtime

    return {"last_modified_unix": newest}


@router.post("/packs/{workshop_id}/open")
def open_pack_folder(workshop_id: str):
    """Open the local Steam Workshop folder for `workshop_id` in the system file explorer.

    Args:
        workshop_id: Numeric Steam Workshop item id.

    Returns:
        `{"status": "success"}` when the folder is opened.

    Raises:
        HTTPException(400): When `workshop_id` is not purely numeric.
        HTTPException(404): When the Steam library drive is unset or the workshop folder does not exist on disk.
        HTTPException(500): When the OS call to open the folder fails.
    """
    if not _WORKSHOP_ID_RE.fullmatch(workshop_id):
        raise HTTPException(status_code=400, detail="workshop_id must be numeric")

    folder = tw3_workshop_content_dir(workshop_id)
    if folder is None or not folder.is_dir():
        raise HTTPException(status_code=404, detail="workshop folder not found")

    try:
        os.startfile(folder)
        return {"status": "success"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {exc}")


class PublishBody(BaseModel):
    """Request body for POST /packs/{workshop_id}/publish."""

    changenote: str = ""
    """ Update note shown in the Workshop changelog. Empty string omits the field from the VDF. """


@router.post("/packs/{workshop_id}/publish")
def post_pack_publish(workshop_id: str, body: PublishBody):
    """Spawn SteamCMD to push the local workshop folder as an update to the existing Workshop item.

    Single-flight - a 409 is returned if another publish is still running. Live progress is
    available via `GET /packs/{workshop_id}/publish/stream`.

    Args:
        workshop_id: Numeric Steam Workshop item id of the existing entry to update.
        body: Request body with the `changenote` for this update.

    Returns:
        `{"publish_id", "workshop_id", "started_at"}` on success.

    Raises:
        HTTPException(400): When `workshop_id` is not purely numeric, or when preflight checks
            fail (missing `steamcmd_path`, `steam_username`, or content folder). Detail body
            for preflight failures is `{"missing": [...]}`.
        HTTPException(404): When the Steam library drive is unset or the workshop folder does not
            exist on disk.
        HTTPException(409): When another publish is already in progress.
    """
    if not _WORKSHOP_ID_RE.fullmatch(workshop_id):
        raise HTTPException(status_code=400, detail="workshop_id must be numeric")

    folder = tw3_workshop_content_dir(workshop_id)
    if folder is None or not folder.is_dir():
        raise HTTPException(status_code=404, detail="workshop folder not found")

    try:
        handle = wp.start_publish(
            workshop_id,
            folder,
            body.changenote,
            steamcmd_path=config.STEAMCMD_PATH,
            steam_username=config.STEAM_USERNAME,
        )
    except wp.PublisherPreflightError as exc:
        raise HTTPException(status_code=400, detail={"missing": exc.missing})
    except wp.PublishInProgressError:
        raise HTTPException(status_code=409, detail="a publish is already in progress")

    return {
        "publish_id": handle.publish_id,
        "workshop_id": handle.workshop_id,
        "started_at": handle.started_at.isoformat(),
    }


@router.get("/packs/{workshop_id}/publish/stream")
async def get_pack_publish_stream(workshop_id: str):
    """Server-sent events: stream buffered + new SteamCMD log lines until publish ends.

    Each `data:` event carries one stdout line. A final `event: done` arrives when SteamCMD
    exits (or immediately if no publish has ever started in this session). The `workshop_id`
    path parameter is validated for shape but not cross-checked against the active publish -
    only one publish runs at a time.

    Args:
        workshop_id: Numeric Steam Workshop item id (validated for shape only).

    Returns:
        A `StreamingResponse` with `text/event-stream` content type.

    Raises:
        HTTPException(400): When `workshop_id` is not purely numeric.
    """
    if not _WORKSHOP_ID_RE.fullmatch(workshop_id):
        raise HTTPException(status_code=400, detail="workshop_id must be numeric")

    async def event_source():
        async for event in wp.stream_lines():
            kind = event["event"]
            if kind == "data":
                payload = {"line": event["line"], "ts": event["ts"]}
                yield f"data: {json.dumps(payload)}\n\n"
            elif kind == "done":
                payload = {
                    "exit_code": event.get("exit_code"),
                    "duration_seconds": event.get("duration_seconds"),
                }
                yield f"event: done\ndata: {json.dumps(payload)}\n\n"
                break

    return StreamingResponse(event_source(), media_type="text/event-stream")
