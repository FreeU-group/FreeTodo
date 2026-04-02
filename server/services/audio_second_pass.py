"""Shared second-pass helper logic for audio websocket handlers."""

from __future__ import annotations

import asyncio
import contextlib
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

SECOND_PASS_TIMEOUT = 120
SP_MIN_FINAL_TEXT_LEN = 4


async def publish_second_pass_result(*, processor, result, websocket: WebSocket, logger) -> None:
    """Publish refined segments to perception stream and websocket client."""
    if result is None or not result.segments:
        return

    for seg in result.segments:
        if seg.text.strip():
            await processor.publish_perception(
                seg.text,
                is_realtime=False,
                speaker_tag=seg.speaker_name,
                speaker_id=seg.speaker_id,
            )

    try:
        from starlette.websockets import WebSocketState  # noqa: PLC0415

        if (
            websocket.application_state == WebSocketState.CONNECTED
            and websocket.client_state == WebSocketState.CONNECTED
        ):
            refined_segs = [
                {
                    "text": seg.text,
                    "speaker_name": seg.speaker_name,
                    "speaker_id": seg.speaker_id,
                }
                for seg in result.segments
                if seg.text.strip()
            ]
            await websocket.send_json(
                {
                    "header": {"name": "TranscriptionRefined"},
                    "payload": {"segments": refined_segs},
                }
            )
    except Exception as exc:
        logger.debug(f"Failed to send refined transcript: {exc}")


async def run_second_pass_debounce_loop(  # noqa: PLR0913
    *,
    processor,
    state: dict[str, Any],
    trigger: asyncio.Event,
    cursor_ref: list[int],
    final_idx_ref: list[int],
    pending_text: list[str],
    websocket: WebSocket,
    logger,
) -> None:
    """Debounced second-pass loop that slices audio on final sentence boundaries."""
    last_run = time.monotonic()
    while state["is_connected_ref"][0]:
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(trigger.wait(), timeout=processor.sp_max_wait)

        if not state["is_connected_ref"][0]:
            break
        trigger.clear()

        deadline = time.monotonic() + processor.sp_debounce
        max_deadline = last_run + processor.sp_max_wait
        while state["is_connected_ref"][0] and time.monotonic() < min(deadline, max_deadline):
            remaining = min(deadline, max_deadline) - time.monotonic()
            if remaining <= 0:
                break
            try:
                await asyncio.wait_for(trigger.wait(), timeout=remaining)
                trigger.clear()
                deadline = time.monotonic() + processor.sp_debounce
            except TimeoutError:
                break

        if not state["is_connected_ref"][0]:
            break

        end = final_idx_ref[0]
        if end <= cursor_ref[0]:
            continue
        chunks_slice = state["audio_chunks"][cursor_ref[0] : end]
        start = cursor_ref[0]
        cursor_ref[0] = end
        pending_text.clear()
        last_run = time.monotonic()
        logger.info(f"[transcribe] Second-pass triggered: processing chunks [{start}:{end}]")
        try:
            result = await asyncio.wait_for(
                processor.run_second_pass(chunks_slice),
                timeout=SECOND_PASS_TIMEOUT,
            )
        except TimeoutError:
            logger.warning(
                f"[transcribe] Second-pass timed out after {SECOND_PASS_TIMEOUT}s, skipping"
            )
            continue

        await publish_second_pass_result(
            processor=processor, result=result, websocket=websocket, logger=logger
        )
