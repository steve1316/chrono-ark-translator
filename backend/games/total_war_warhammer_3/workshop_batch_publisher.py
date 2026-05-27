"""Serialized batch orchestrator on top of `workshop_publisher` for pushing many TW3 mods at once.

Wraps the single-flight per-mod publisher in a background task that runs items one at a time, sharing a single changelog
across the batch. Surfaces per-mod status (pending/running/done/failed) and a unified event stream the SSE route can fan
out to one or more subscribers, including late-joining ones that reconnect mid-batch.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncIterator, Literal

from backend.games.total_war_warhammer_3 import workshop_publisher as wp
from backend.games.total_war_warhammer_3.routes._paths import tw3_workshop_content_dir


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Public types


ItemStatus = Literal["pending", "running", "done", "failed"]


@dataclass
class BatchItem:
    """One mod's slot in a batch publish, updated in place as the orchestrator progresses."""

    workshop_id: str
    """ Steam Workshop item id being updated. """
    title: str
    """ Human-readable mod title carried along for UI display. """
    status: ItemStatus = "pending"
    """ Current lifecycle state. Transitions: pending -> running -> done|failed. """
    exit_code: int | None = None
    """ SteamCMD return code once the mod finishes. None while still pending or running. """
    error: str | None = None
    """ Human-readable failure reason when status is `failed`; None otherwise. """
    started_at: datetime | None = None
    """ UTC timestamp when this mod's SteamCMD call was spawned. """
    ended_at: datetime | None = None
    """ UTC timestamp when this mod's SteamCMD call exited. """


@dataclass
class BatchHandle:
    """Bookkeeping for one in-flight or completed batch publish."""

    batch_id: str
    """ Unique identifier for this batch, generated at start time. """
    changenote: str
    """ Shared changelog applied to every mod in the batch. """
    items: list[BatchItem]
    """ Per-mod slots in the order they will run. """
    started_at: datetime
    """ UTC timestamp when the orchestrator began the batch. """
    ended_at: datetime | None = None
    """ UTC timestamp when the orchestrator finished all items; None while running. """
    events_log: list[dict] = field(default_factory=list)
    """ Bounded replay buffer of every SSE event emitted so reconnects can rebuild state. """
    done_event: asyncio.Event = field(default_factory=asyncio.Event)
    """ Signaled once the orchestrator's background task finishes. """
    _subscribers: list[asyncio.Queue] = field(default_factory=list)
    """ Live SSE subscribers; each queued event is fanned out to all of them. """


class BatchInProgressError(Exception):
    """Raised when `start_batch` is called while another batch (or a single-mod publish) is active."""


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Module state


_EVENTS_LOG_MAX = 2000
_SUBSCRIBER_QUEUE_MAX = 1000

_batches: dict[str, BatchHandle] = {}
_current_batch_id: str | None = None


def _reset_state() -> None:
    """Clear all batch state. Test-only helper."""
    global _current_batch_id
    _batches.clear()
    _current_batch_id = None


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Public API


def start_batch(
    items: list[dict],
    changenote: str,
    *,
    steamcmd_path: str,
    steam_username: str,
) -> BatchHandle:
    """Start orchestrating a sequential batch publish.

    The function returns immediately after spawning the background task; callers receive a `BatchHandle` they can use to
    look up the batch id, subscribe to the event stream, or await `done_event` for completion.

    Args:
        items: list of `{"workshop_id": str, "title": str}` dicts in run order.
        changenote: shared Steam Workshop changelog applied to every mod.
        steamcmd_path: path to `steamcmd.exe` forwarded to `workshop_publisher.start_publish`.
        steam_username: Steam account username forwarded to `workshop_publisher.start_publish`.

    Raises:
        ValueError: when `changenote` is blank or `items` is empty.
        BatchInProgressError: when another batch is active or a single-mod publish is in progress.

    Returns:
        The created `BatchHandle`.
    """
    global _current_batch_id

    if not changenote or not changenote.strip():
        raise ValueError("changenote must not be empty")
    if not items:
        raise ValueError("items must not be empty")

    if _current_batch_id is not None:
        active = _batches.get(_current_batch_id)
        if active is not None and active.ended_at is None:
            raise BatchInProgressError("another batch is already in progress")

    if not wp.is_idle():
        raise BatchInProgressError("a single-mod publish is already in progress")

    batch_id = uuid.uuid4().hex
    handle = BatchHandle(
        batch_id=batch_id,
        changenote=changenote,
        items=[BatchItem(workshop_id=str(it["workshop_id"]), title=str(it.get("title", ""))) for it in items],
        started_at=datetime.now(timezone.utc),
    )
    _batches[batch_id] = handle
    _current_batch_id = batch_id

    asyncio.create_task(_run_batch(handle, steamcmd_path=steamcmd_path, steam_username=steam_username))
    return handle


def current_batch() -> BatchHandle | None:
    """Return the active batch handle, or None when no batch is running.

    A completed batch is retained in `_batches` for late stream reconnects, but is no longer considered "current".
    """
    if _current_batch_id is None:
        return None
    handle = _batches.get(_current_batch_id)
    if handle is None or handle.ended_at is not None:
        return None
    return handle


def get_batch(batch_id: str) -> BatchHandle | None:
    """Return the batch handle for `batch_id`, or None if it is unknown."""
    return _batches.get(batch_id)


async def stream_batch(batch_id: str) -> AsyncIterator[dict]:
    """Yield every event seen so far for `batch_id`, then live-tail new ones until the batch ends.

    Args:
        batch_id: the id returned from `start_batch`.

    Raises:
        KeyError: when no batch exists for `batch_id`.

    Yields:
        Event dicts of the form `{"event": <type>, "data": <payload>}`.
    """
    handle = _batches.get(batch_id)
    if handle is None:
        raise KeyError(batch_id)

    for evt in list(handle.events_log):
        yield evt

    if handle.ended_at is not None:
        return

    q: asyncio.Queue = asyncio.Queue(maxsize=_SUBSCRIBER_QUEUE_MAX)
    handle._subscribers.append(q)
    try:
        while True:
            evt = await q.get()
            if evt is None:
                break
            yield evt
    finally:
        try:
            handle._subscribers.remove(q)
        except ValueError:
            pass


# //////////////////////////////////////////////////////////////////////////////////////////////////
# //////////////////////////////////////////////////////////////////////////////////////////////////
# Internals


def _emit(handle: BatchHandle, event_type: str, data: dict) -> None:
    """Append an event to the replay buffer and fan it out to every live subscriber.

    The replay buffer is capped at `_EVENTS_LOG_MAX`; older entries are dropped. Subscriber queues that are full drop
    their oldest entry and inject a synthetic throttle notice so callers know there's a gap.
    """
    event = {"event": event_type, "data": data}
    handle.events_log.append(event)
    if len(handle.events_log) > _EVENTS_LOG_MAX:
        del handle.events_log[: len(handle.events_log) - _EVENTS_LOG_MAX]

    for q in list(handle._subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            throttle = {
                "event": "log_line",
                "data": {"workshop_id": "", "line": "[... log throttled ...]", "ts": datetime.now(timezone.utc).isoformat()},
            }
            try:
                q.put_nowait(throttle)
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


def _close_subscribers(handle: BatchHandle) -> None:
    """Push the sentinel that tells every subscriber's stream_batch loop to break."""
    for q in list(handle._subscribers):
        try:
            q.put_nowait(None)
        except asyncio.QueueFull:
            pass


async def _run_batch(handle: BatchHandle, *, steamcmd_path: str, steam_username: str) -> None:
    """Background task body: publish each batch item sequentially and emit events as they happen."""
    global _current_batch_id

    _emit(
        handle,
        "batch_started",
        {
            "batch_id": handle.batch_id,
            "total": len(handle.items),
            "items": [{"workshop_id": it.workshop_id, "title": it.title} for it in handle.items],
        },
    )

    succeeded = 0
    failed = 0

    try:
        for idx, item in enumerate(handle.items):
            item.status = "running"
            item.started_at = datetime.now(timezone.utc)
            _emit(
                handle,
                "mod_started",
                {
                    "workshop_id": item.workshop_id,
                    "title": item.title,
                    "index": idx + 1,
                    "total": len(handle.items),
                    "started_at": item.started_at.isoformat(),
                },
            )

            folder = tw3_workshop_content_dir(item.workshop_id)
            if folder is None or not folder.is_dir():
                _finalize_item(item, status="failed", exit_code=None, error="workshop folder not found")
                _emit_mod_finished(handle, item, duration=0.0)
                failed += 1
                continue

            try:
                wp.start_publish(
                    item.workshop_id,
                    folder,
                    handle.changenote,
                    steamcmd_path=steamcmd_path,
                    steam_username=steam_username,
                )
            except wp.PublisherPreflightError as exc:
                _finalize_item(item, status="failed", exit_code=None, error=f"preflight failed: {exc.missing}")
                _emit_mod_finished(handle, item, duration=0.0)
                failed += 1
                continue
            except wp.PublishInProgressError:
                _finalize_item(item, status="failed", exit_code=None, error="another publish was already running")
                _emit_mod_finished(handle, item, duration=0.0)
                failed += 1
                continue

            exit_code: int | None = None
            duration = 0.0
            async for evt in wp.stream_lines():
                kind = evt["event"]
                if kind == "data":
                    _emit(
                        handle,
                        "log_line",
                        {
                            "workshop_id": item.workshop_id,
                            "line": evt.get("line", ""),
                            "ts": evt.get("ts", ""),
                        },
                    )
                elif kind == "done":
                    exit_code = evt.get("exit_code")
                    duration = float(evt.get("duration_seconds") or 0.0)
                    break

            if exit_code == 0:
                _finalize_item(item, status="done", exit_code=0, error=None)
                succeeded += 1
            else:
                _finalize_item(item, status="failed", exit_code=exit_code, error=f"SteamCMD exit code {exit_code}")
                failed += 1
            _emit_mod_finished(handle, item, duration=duration)
    finally:
        handle.ended_at = datetime.now(timezone.utc)
        _emit(
            handle,
            "batch_done",
            {
                "batch_id": handle.batch_id,
                "succeeded": succeeded,
                "failed": failed,
                "duration_seconds": (handle.ended_at - handle.started_at).total_seconds(),
            },
        )
        _close_subscribers(handle)
        if _current_batch_id == handle.batch_id:
            _current_batch_id = None
        handle.done_event.set()


def _finalize_item(item: BatchItem, *, status: ItemStatus, exit_code: int | None, error: str | None) -> None:
    """Stamp the terminal fields on a `BatchItem` once its publish call has finished."""
    item.status = status
    item.exit_code = exit_code
    item.error = error
    item.ended_at = datetime.now(timezone.utc)


def _emit_mod_finished(handle: BatchHandle, item: BatchItem, *, duration: float) -> None:
    """Emit the `mod_finished` event using the terminal fields on `item`."""
    _emit(
        handle,
        "mod_finished",
        {
            "workshop_id": item.workshop_id,
            "exit_code": item.exit_code,
            "duration_seconds": duration,
            "status": item.status,
            "error": item.error,
        },
    )
