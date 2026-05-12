"""HTTP routes for TW3 Steam Workshop preview images served from disk."""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

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

    for entry in sorted(folder.iterdir()):
        if entry.is_file() and entry.suffix.lower() in _IMAGE_SUFFIXES:
            return FileResponse(entry, media_type=_MEDIA_TYPES[entry.suffix.lower()])

    raise HTTPException(status_code=404, detail="no preview image found")
