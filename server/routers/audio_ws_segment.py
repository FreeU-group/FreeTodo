"""Audio websocket segment monitoring and background persistence."""

from __future__ import annotations

import asyncio
import importlib
from typing import TYPE_CHECKING, Any

from starlette.websockets import WebSocketState

from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from datetime import datetime

# Kept local (mirrors audio_ws.py) to avoid circular imports.
SILENCE_CHECK_INTERVAL_SECONDS = 2
SILENCE_DETECTION_THRESHOLD_SECONDS = 600
SEGMENT_DURATION_MINUTES = 30

# Realtime segmentation by speaker turn changes.
SPEAKER_CHANGE_SEGMENT_MIN_SECONDS = 4
SPEAKER_CHANGE_COOLDOWN_SECONDS = 2

_segment_tasks: set[asyncio.Task] = set()


def _track_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _segment_tasks.add(task)
    task.add_done_callback(_segment_tasks.discard)
    return task


class _SegmentMonitorContext:
    """Context object for the monitor loop."""

    def __init__(self, **kwargs):
        self.logger = kwargs["logger"]
        self.audio_service = kwargs["audio_service"]
        self.recording_started_at = kwargs["recording_started_at"]
        self.audio_chunks = kwargs["audio_chunks"]
        self.transcription_text_ref = kwargs["transcription_text_ref"]
        self.segment_timestamps_ref = kwargs["segment_timestamps_ref"]
        self.should_segment_ref = kwargs["should_segment_ref"]
        self.is_connected_ref = kwargs["is_connected_ref"]
        self.websocket = kwargs.get("websocket")
        self.speaker_diarizer = kwargs.get("speaker_diarizer")


class _SegmentSaveContext:
    """Context object for a single segment save."""

    def __init__(self, **kwargs):
        self.logger = kwargs["logger"]
        self.audio_service = kwargs["audio_service"]
        self.audio_chunks = kwargs["audio_chunks"]
        self.transcription_text_ref = kwargs["transcription_text_ref"]
        self.segment_timestamps_ref = kwargs["segment_timestamps_ref"]
        self.segment_start_time = kwargs["segment_start_time"]
        self.websocket = kwargs.get("websocket")
        self.is_connected_ref = kwargs.get("is_connected_ref")
        self.segment_reason = kwargs.get("segment_reason")


async def _notify_segment_saved(ctx: _SegmentSaveContext) -> None:
    """Notify frontend that current segment was saved."""
    if not ctx.websocket or not ctx.is_connected_ref or not ctx.is_connected_ref[0]:
        return

    try:
        if (
            ctx.websocket.application_state == WebSocketState.CONNECTED
            and ctx.websocket.client_state == WebSocketState.CONNECTED
        ):
            reason_message = ctx.segment_reason or "Current segment saved. Started a new segment."
            await ctx.websocket.send_json(
                {
                    "header": {"name": "SegmentSaved"},
                    "payload": {
                        "message": reason_message,
                        "segment_start_time": ctx.segment_start_time.isoformat(),
                    },
                }
            )
            ctx.logger.info("SegmentSaved notification sent to client")
    except Exception as e:
        ctx.logger.warning(f"Failed to notify SegmentSaved: {e}")


async def _notify_segment_boundary_only(
    *,
    ctx: _SegmentMonitorContext,
    segment_start_time: datetime,
    segment_reason: str,
) -> None:
    """Emit a segment boundary event without persisting/clearing buffers."""
    notify_ctx = _SegmentSaveContext(
        **{
            "logger": ctx.logger,
            "audio_service": ctx.audio_service,
            "audio_chunks": [],
            "transcription_text_ref": [""],
            "segment_timestamps_ref": [None],
            "segment_start_time": segment_start_time,
            "websocket": ctx.websocket,
            "is_connected_ref": ctx.is_connected_ref,
            "segment_reason": segment_reason,
        }
    )
    await _notify_segment_saved(notify_ctx)


async def _persist_segment_async(
    *,
    logger,
    audio_service,
    audio_chunks: list[bytes],
    transcription_text: str,
    segment_timestamps: list[float] | None,
    segment_start_time: datetime,
) -> None:
    """Persist one segment in the background."""
    audio_ws_module = importlib.import_module("routers.audio_ws")
    _persist_recording = audio_ws_module._persist_recording
    _save_transcription_if_any = audio_ws_module._save_transcription_if_any

    try:
        recording_id, duration = _persist_recording(
            logger=logger,
            audio_service=audio_service,
            audio_chunks=audio_chunks,
            recording_started_at=segment_start_time,
            is_24x7=True,
        )
        await _save_transcription_if_any(
            audio_service=audio_service,
            recording_id=recording_id,
            text=transcription_text,
            segment_timestamps=segment_timestamps,
        )
        if recording_id is not None and duration is not None:
            logger.info(f"Segment persisted: recording_id={recording_id}, duration={duration:.2f}s")
        else:
            logger.info("Segment persistence skipped: empty audio/text")
    except Exception as e:
        logger.error(f"Failed to persist segment: {e}", exc_info=True)


async def _save_current_segment(*, params: dict[str, Any]) -> None:
    """Save current segment and clear in-memory buffers."""
    logger = params["logger"]
    audio_service = params["audio_service"]
    audio_chunks = params["audio_chunks"]
    transcription_text_ref = params["transcription_text_ref"]
    segment_timestamps_ref = params["segment_timestamps_ref"]
    segment_start_time = params["segment_start_time"]
    websocket = params.get("websocket")
    is_connected_ref = params.get("is_connected_ref")
    segment_reason = params.get("segment_reason")

    if not audio_chunks:
        logger.debug("Skip segment save: no audio chunks")
        return

    current_chunks = audio_chunks.copy()
    current_text = transcription_text_ref[0]
    current_timestamps = segment_timestamps_ref[0]

    audio_chunks.clear()
    transcription_text_ref[0] = ""
    segment_timestamps_ref[0] = None

    ctx = _SegmentSaveContext(
        **{
            "logger": logger,
            "audio_service": audio_service,
            "audio_chunks": current_chunks,
            "transcription_text_ref": [current_text],
            "segment_timestamps_ref": [current_timestamps],
            "segment_start_time": segment_start_time,
            "websocket": websocket,
            "is_connected_ref": is_connected_ref,
            "segment_reason": segment_reason,
        }
    )

    await _notify_segment_saved(ctx)

    _track_task(
        _persist_segment_async(
            logger=ctx.logger,
            audio_service=ctx.audio_service,
            audio_chunks=ctx.audio_chunks,
            transcription_text=ctx.transcription_text_ref[0],
            segment_timestamps=ctx.segment_timestamps_ref[0],
            segment_start_time=ctx.segment_start_time,
        )
    )


async def _check_time_segment(
    ctx: _SegmentMonitorContext, now: datetime, segment_start_time: datetime
) -> bool:
    elapsed = (now - segment_start_time).total_seconds()
    if elapsed < SEGMENT_DURATION_MINUTES * 60:
        return False

    ctx.logger.info("Segment by fixed duration trigger")
    await _save_current_segment(
        params={
            "logger": ctx.logger,
            "audio_service": ctx.audio_service,
            "audio_chunks": ctx.audio_chunks,
            "transcription_text_ref": ctx.transcription_text_ref,
            "segment_timestamps_ref": ctx.segment_timestamps_ref,
            "segment_start_time": segment_start_time,
            "websocket": ctx.websocket,
            "is_connected_ref": ctx.is_connected_ref,
            "segment_reason": "Segmented by max duration.",
        }
    )
    return True


async def _check_silence_segment(
    ctx: _SegmentMonitorContext,
    now: datetime,
    segment_start_time: datetime,
    silence_start_time: datetime | None,
) -> tuple[bool, datetime | None]:
    if len(ctx.audio_chunks) == 0:
        return False, silence_start_time

    audio_ws_module = importlib.import_module("routers.audio_ws")
    _detect_silence = audio_ws_module._detect_silence

    recent_chunks = ctx.audio_chunks[-10:]
    recent_audio = b"".join(recent_chunks)
    is_silent = _detect_silence(recent_audio)

    if not is_silent:
        return False, None

    if silence_start_time is None:
        return False, now

    silence_duration = (now - silence_start_time).total_seconds()
    if silence_duration < SILENCE_DETECTION_THRESHOLD_SECONDS:
        return False, silence_start_time

    ctx.logger.info(f"Segment by long silence trigger ({silence_duration:.0f}s)")
    await _save_current_segment(
        params={
            "logger": ctx.logger,
            "audio_service": ctx.audio_service,
            "audio_chunks": ctx.audio_chunks,
            "transcription_text_ref": ctx.transcription_text_ref,
            "segment_timestamps_ref": ctx.segment_timestamps_ref,
            "segment_start_time": segment_start_time,
            "websocket": ctx.websocket,
            "is_connected_ref": ctx.is_connected_ref,
            "segment_reason": f"Segmented by long silence ({silence_duration:.0f}s).",
        }
    )
    return True, None


async def _check_manual_segment(
    ctx: _SegmentMonitorContext,
    now: datetime,
    segment_start_time: datetime,
    *,
    persist_segment: bool,
) -> bool:
    _ = now
    if not ctx.should_segment_ref[0]:
        return False

    ctx.logger.info("Segment by manual request trigger")
    if persist_segment:
        await _save_current_segment(
            params={
                "logger": ctx.logger,
                "audio_service": ctx.audio_service,
                "audio_chunks": ctx.audio_chunks,
                "transcription_text_ref": ctx.transcription_text_ref,
                "segment_timestamps_ref": ctx.segment_timestamps_ref,
                "segment_start_time": segment_start_time,
                "websocket": ctx.websocket,
                "is_connected_ref": ctx.is_connected_ref,
                "segment_reason": "Segmented by manual request.",
            }
        )
    else:
        await _notify_segment_boundary_only(
            ctx=ctx,
            segment_start_time=segment_start_time,
            segment_reason="Segmented by manual request.",
        )
    ctx.should_segment_ref[0] = False
    return True


def _get_speaker_turn_key(ctx: _SegmentMonitorContext) -> str | None:
    """Read current speaker turn key from diarizer with a lightweight method."""
    diarizer = ctx.speaker_diarizer
    if diarizer is None:
        return None
    getter = diarizer.get_current_turn_key if hasattr(diarizer, "get_current_turn_key") else None
    if not callable(getter):
        return None
    try:
        key = getter()
        return key if isinstance(key, str) and key else None
    except Exception:
        return None


async def _check_speaker_change_segment(  # noqa: PLR0911
    ctx: _SegmentMonitorContext,
    now: datetime,
    segment_start_time: datetime,
    last_turn_key: str | None,
    last_change_at: datetime | None,
    *,
    persist_segment: bool,
) -> tuple[bool, str | None, datetime | None]:
    """Segment in realtime when speaker turn changes."""
    current_turn_key = _get_speaker_turn_key(ctx)
    if current_turn_key is None:
        return False, last_turn_key, last_change_at
    if last_turn_key is None:
        return False, current_turn_key, last_change_at
    if current_turn_key == last_turn_key:
        return False, current_turn_key, last_change_at
    if not ctx.audio_chunks:
        return False, current_turn_key, last_change_at

    elapsed = (now - segment_start_time).total_seconds()
    if elapsed < SPEAKER_CHANGE_SEGMENT_MIN_SECONDS:
        return False, current_turn_key, last_change_at

    if last_change_at is not None:
        since_last_change = (now - last_change_at).total_seconds()
        if since_last_change < SPEAKER_CHANGE_COOLDOWN_SECONDS:
            return False, current_turn_key, last_change_at

    ctx.logger.info(f"Segment by speaker turn change: {last_turn_key} -> {current_turn_key}")
    if persist_segment:
        await _save_current_segment(
            params={
                "logger": ctx.logger,
                "audio_service": ctx.audio_service,
                "audio_chunks": ctx.audio_chunks,
                "transcription_text_ref": ctx.transcription_text_ref,
                "segment_timestamps_ref": ctx.segment_timestamps_ref,
                "segment_start_time": segment_start_time,
                "websocket": ctx.websocket,
                "is_connected_ref": ctx.is_connected_ref,
                "segment_reason": "Segmented by speaker turn change.",
            }
        )
    else:
        await _notify_segment_boundary_only(
            ctx=ctx,
            segment_start_time=segment_start_time,
            segment_reason="Segmented by speaker turn change.",
        )
    return True, current_turn_key, now


async def _segment_monitor_task(*, params: dict[str, Any], is_24x7: bool) -> None:
    """Monitor segmentation conditions and save segments asynchronously."""
    _ = is_24x7
    logger = params["logger"]
    recording_started_at = params["recording_started_at"]

    ctx = _SegmentMonitorContext(**params)
    segment_start_time = recording_started_at
    silence_start_time: datetime | None = None
    last_turn_key: str | None = None
    last_speaker_change_at: datetime | None = None

    while ctx.is_connected_ref[0]:
        try:
            await asyncio.sleep(SILENCE_CHECK_INTERVAL_SECONDS)
            if not ctx.is_connected_ref[0]:
                break

            now = get_utc_now()

            (
                speaker_changed,
                last_turn_key,
                last_speaker_change_at,
            ) = await _check_speaker_change_segment(
                ctx,
                now,
                segment_start_time,
                last_turn_key,
                last_speaker_change_at,
                persist_segment=is_24x7,
            )
            if speaker_changed:
                segment_start_time = now
                silence_start_time = None
                ctx.recording_started_at = now
                continue

            if is_24x7 and await _check_time_segment(ctx, now, segment_start_time):
                segment_start_time = now
                silence_start_time = None
                ctx.recording_started_at = now
                continue

            if is_24x7:
                was_segmented, silence_start_time = await _check_silence_segment(
                    ctx, now, segment_start_time, silence_start_time
                )
                if was_segmented:
                    segment_start_time = now
                    ctx.recording_started_at = now
                    continue

            if await _check_manual_segment(ctx, now, segment_start_time, persist_segment=is_24x7):
                segment_start_time = now
                silence_start_time = None
                ctx.recording_started_at = now

        except asyncio.CancelledError:
            logger.info("Segment monitor task cancelled")
            break
        except Exception as e:
            logger.error(f"Segment monitor task error: {e}", exc_info=True)
            await asyncio.sleep(5)
