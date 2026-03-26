"""Second-pass refinement helpers for the omi-compatible listen websocket."""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from starlette.websockets import WebSocketState

from routers.omi_compat.listen_events import build_refined_transcript_event, build_segment_dict
from util.logging_config import get_logger
from util.settings import settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi import WebSocket

logger = get_logger()


def load_second_pass_processor():
    """Create the optional second-pass processor if configured."""
    try:
        from services.second_pass_asr import SecondPassASRProcessor

        processor = SecondPassASRProcessor()
        if processor.enabled:
            logger.info("[omi-compat] second-pass refinement enabled")
            return processor
        logger.debug("[omi-compat] second-pass disabled (audio.second_pass.enabled=false)")
    except Exception as exc:
        logger.debug(f"[omi-compat] second-pass initialization failed: {exc}")
    return None


def get_second_pass_timing() -> tuple[int, int]:
    """Return ``(debounce_seconds, interval_seconds)`` from settings."""
    debounce_seconds = int(settings.get("audio.second_pass.debounce_seconds", 3) or 3)
    interval_seconds = int(settings.get("audio.second_pass.interval_seconds", 30) or 30)
    return debounce_seconds, interval_seconds


class SecondPassRunner:
    """Handle sentence-aligned second-pass refinement for one websocket session."""

    @dataclass(frozen=True)
    class Config:
        session_id: str
        websocket: WebSocket
        is_connected: Callable[[], bool]
        sp_debounce: int
        sp_max_wait: int
        publish_refined_perception: Callable[[str, str | None, int | None], Awaitable[None]]

    def __init__(
        self,
        *,
        processor,
        trigger: asyncio.Event,
        audio_chunks: list[bytes],
        config: Config | dict[str, Any],
    ):
        self.processor = processor
        self.trigger = trigger
        self.audio_chunks = audio_chunks
        self.config = config if isinstance(config, self.Config) else self.Config(**config)
        self.second_pass_cursor = 0
        self.latest_final_chunk_idx = 0

    @property
    def enabled(self) -> bool:
        return self.processor is not None

    def note_final(self, chunk_count: int) -> None:
        if not self.enabled:
            return
        self.latest_final_chunk_idx = chunk_count
        self.trigger.set()
        logger.info(
            "[omi-compat] is_final received: chunks=%d cursor=%d",
            self.latest_final_chunk_idx,
            self.second_pass_cursor,
        )

    async def _send_refined_segments(self, result: Any) -> None:
        if result is None or not result.segments:
            return

        refined_segments = [
            build_segment_dict(
                idx,
                segment.text,
                segment.begin_time_ms / 1000.0,
                segment.end_time_ms / 1000.0,
                is_user=True,
                speaker_id=segment.speaker_name or f"说话人 {segment.speaker_id}",
            )
            for idx, segment in enumerate(result.segments)
        ]

        try:
            if (
                self.config.websocket.application_state == WebSocketState.CONNECTED
                and self.config.websocket.client_state == WebSocketState.CONNECTED
            ):
                await self.config.websocket.send_json(
                    build_refined_transcript_event(self.config.session_id, refined_segments)
                )
                logger.info(
                    "[omi-compat] Sent %d refined segments to client",
                    len(refined_segments),
                )
        except Exception as exc:
            logger.debug(f"[omi-compat] Failed to send refined transcript: {exc}")

        for segment in result.segments:
            if segment.text.strip():
                await self.config.publish_refined_perception(
                    segment.text,
                    segment.speaker_name,
                    segment.speaker_id,
                )

    async def _run_second_pass(self, chunks_slice: list[bytes]) -> None:
        if not self.enabled or not chunks_slice:
            return
        try:
            result = await self.processor.process(chunks_slice, self.config.session_id)
            if result is None or not result.segments:
                logger.info(
                    "[omi-compat] Second-pass returned no segments "
                    "(audio may be too short or processing failed)"
                )
            await self._send_refined_segments(result)
        except Exception:
            logger.exception("[omi-compat] Second-pass processing error")

    async def timer_loop(self) -> None:
        """Submit sentence-aligned chunks after debounce or max interval."""
        if not self.enabled:
            return

        last_run = time.monotonic()
        while self.config.is_connected():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.trigger.wait(), timeout=self.config.sp_max_wait)

            if not self.config.is_connected():
                break
            self.trigger.clear()

            deadline = time.monotonic() + self.config.sp_debounce
            max_deadline = last_run + self.config.sp_max_wait
            while self.config.is_connected() and time.monotonic() < min(deadline, max_deadline):
                remaining = min(deadline, max_deadline) - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    await asyncio.wait_for(self.trigger.wait(), timeout=remaining)
                    self.trigger.clear()
                    deadline = time.monotonic() + self.config.sp_debounce
                except TimeoutError:
                    break

            if not self.config.is_connected():
                break

            end = self.latest_final_chunk_idx
            if end <= self.second_pass_cursor:
                logger.debug(
                    "[omi-compat] Second-pass skip: end=%d <= cursor=%d",
                    end,
                    self.second_pass_cursor,
                )
                continue

            start = self.second_pass_cursor
            chunks_slice = self.audio_chunks[start:end]
            self.second_pass_cursor = end
            last_run = time.monotonic()
            logger.info(
                "[omi-compat] Second-pass triggered (debounce): processing chunks [%d:%d]",
                start,
                end,
            )
            await self._run_second_pass(chunks_slice)

    async def final_flush(self) -> None:
        """Process any remaining finalized audio on disconnect."""
        if not self.enabled:
            return
        end = self.latest_final_chunk_idx
        if end <= self.second_pass_cursor:
            return
        start = self.second_pass_cursor
        chunks_slice = self.audio_chunks[start:end]
        self.second_pass_cursor = end
        logger.info("[omi-compat] Second-pass final: processing chunks [%d:%d]", start, end)
        await self._run_second_pass(chunks_slice)
