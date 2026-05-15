"""Downloader + extractor for Valve's official SteamCMD package.

Pulls https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip (~5MB) and unpacks it into a
target directory so the Publish to Workshop feature has a usable `steamcmd.exe` without the user
having to install it manually. The zip ships a tiny bootstrap; SteamCMD self-updates the rest of
its files (~250MB) on first launch.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import httpx

STEAMCMD_DOWNLOAD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"


async def install_steamcmd(target_dir: Path) -> Path:
    """Download `steamcmd.zip` from Valve's CDN and extract it into `target_dir`.

    The target directory is created if missing. Existing files are overwritten by the extraction so
    re-running the install is safe and idempotent.

    Args:
        target_dir: Directory to install SteamCMD into (e.g. `backend/storage/steamcmd`).

    Returns:
        Absolute `Path` to the resolved `steamcmd.exe` inside `target_dir`.

    Raises:
        RuntimeError: When the HTTP download returns non-200, the response is not a valid zip, or
            the extracted archive does not contain `steamcmd.exe`.
    """
    target_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        resp = await client.get(STEAMCMD_DOWNLOAD_URL)
    if resp.status_code != 200:
        raise RuntimeError(f"download failed: HTTP {resp.status_code}")

    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            zf.extractall(target_dir)
    except zipfile.BadZipFile as exc:
        raise RuntimeError(f"downloaded archive is not a valid zip: {exc}")

    steamcmd_exe = target_dir / "steamcmd.exe"
    if not steamcmd_exe.is_file():
        raise RuntimeError("extracted archive does not contain steamcmd.exe")
    return steamcmd_exe
