"""WebSocket ``/v4/listen`` omi-compatible real-time audio transcription.

The omi Flutter App opens a WebSocket to this endpoint, streams Opus
(or PCM) encoded audio from the hardware, and receives transcript
segments in real-time.

Internally we decode the audio, pipe PCM-16 kHz to the existing
DashScope ASR client, and translate the results into omi-format
``MessageEvent`` objects.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from perception.manager import try_get_perception_manager
from perception.models import Modality, PerceptionEvent, SourceType
from routers.omi_compat.auth import verify_ws_token
from routers.omi_compat.listen_audio import build_decoder
from routers.omi_compat.listen_events import (
    build_last_conversation_event,
    build_segment_dict,
    build_transcript_event,
)
from routers.omi_compat.listen_second_pass import (
    SecondPassRunner,
    get_second_pass_timing,
    load_second_pass_processor,
)
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter()


@router.websocket("/v4/listen")
async def omi_listen(  # noqa: C901, PLR0913, PLR0915
    websocket: WebSocket,
    uid: str = Depends(verify_ws_token),
    language: str = "zh",
    sample_rate: int = 16000,
    codec: str = "opus",
    channels: int = 1,
    include_speech_profile: bool = True,
    conversation_timeout: int = 120,
    source: str | None = None,
    custom_stt: str = "disabled",
    onboarding: str = "disabled",
    speaker_auto_assign: str = "disabled",
):
    """Omi-compatible real-time transcription WebSocket.

    Query parameters mirror the original ``/v4/listen`` so the omi App
    can connect without code changes (except pointing ``BASE_API_URL``
    to this server).
    """
    await websocket.accept()

    session_id = str(uuid.uuid4())
    logger.info(
        f"[omi-compat] /v4/listen connected  uid={uid} codec={codec} "
        f"sr={sample_rate} lang={language} source={source}"
    )

    # Build audio decoder
    try:
        decode_fn, _effective_sr = build_decoder(codec, sample_rate)
    except Exception as e:
        logger.error(f"[omi-compat] Failed to build audio decoder (codec={codec}): {e}")
        await websocket.close(code=1011, reason=str(e)[:120])
        return

    # ASR plumbing — lazy import to avoid hard dep at module level
    try:
        from services.asr_client import ASRClient

        asr = ASRClient()
    except Exception as e:
        logger.error(f"[omi-compat] Failed to create ASR client: {e}")
        await websocket.close(code=1011, reason=str(e)[:120])
        return

    # Speaker diarization (optional – degrades gracefully)
    speaker_diarizer = None
    try:
        from services.diart_diarizer import DiartDiarizer

        diarizer = DiartDiarizer()
        diarizer.start()
        if diarizer.enabled:
            speaker_diarizer = diarizer
            logger.info("[omi-compat] 说话人分离已启用 (diart)")
        else:
            logger.debug("[omi-compat] 说话人分离未启用 (diart 不可用)")
    except Exception as e:
        logger.debug(f"[omi-compat] 说话人分离初始化失败: {e}")

    # Shared state
    seg_idx = 0
    session_start = time.monotonic()
    is_connected = True

    # Audio queue fed by the receive loop, consumed by ASR
    audio_q: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=500)
    # Accumulated raw PCM for second-pass offline ASR
    audio_chunks: list[bytes] = []

    asr_cancel_event = asyncio.Event()
    second_pass_trigger = asyncio.Event()

    async def _publish_final_perception(
        text: str,
        *,
        is_realtime: bool = True,
        speaker_tag: str | None = None,
        speaker_id: int | None = None,
    ) -> None:
        """Publish transcription to perception manager.

        Args:
            is_realtime: True for v1 (streaming) results, False for v2 (refined).
        """
        mgr = try_get_perception_manager()
        if mgr is None:
            logger.warning("[omi-compat] PerceptionManager not available, skipping publish")
            return
        try:
            meta: dict = {
                "session_id": session_id,
                "uid": uid,
                "source_endpoint": "/v4/listen",
                "is_realtime": is_realtime,
            }
            if is_realtime:
                meta["speaker"] = "realtime"
            else:
                meta["speaker"] = speaker_tag or "unknown"
                if speaker_id is not None:
                    meta["speaker_id"] = speaker_id
            event = PerceptionEvent(
                timestamp=get_utc_now(),
                source=SourceType.MIC_HARDWARE,
                modality=Modality.AUDIO,
                content_text=text.strip(),
                metadata=meta,
                priority=2 if is_realtime else 3,
            )
            await mgr.publish_event(event)
            tag = "realtime" if is_realtime else "refined"
            logger.info(f"[omi-compat] Published {tag} perception event: {text.strip()[:50]}")
        except Exception:
            logger.exception("[omi-compat] Failed to publish perception event")

    async def _publish_refined_perception(
        text: str,
        speaker_tag: str | None,
        speaker_id: int | None,
    ) -> None:
        await _publish_final_perception(
            text,
            is_realtime=False,
            speaker_tag=speaker_tag,
            speaker_id=speaker_id,
        )

    second_pass_processor = load_second_pass_processor()
    sp_debounce, sp_max_wait = get_second_pass_timing()
    second_pass_runner = SecondPassRunner(
        processor=second_pass_processor,
        trigger=second_pass_trigger,
        audio_chunks=audio_chunks,
        config={
            "session_id": session_id,
            "websocket": websocket,
            "is_connected": lambda: is_connected,
            "sp_debounce": sp_debounce,
            "sp_max_wait": sp_max_wait,
            "publish_refined_perception": _publish_refined_perception,
        },
    )

    async def _audio_generator():
        """Yield PCM chunks from the queue for ASRClient.transcribe_stream."""
        while True:
            try:
                chunk = await asyncio.wait_for(audio_q.get(), timeout=3.0)
            except TimeoutError:
                if asr_cancel_event.is_set() or not is_connected:
                    return
                continue
            if chunk is None:
                return
            yield chunk

    async def _on_result_async(text: str, is_final: bool):
        nonlocal seg_idx
        if not text or not is_connected:
            return
        now = time.monotonic() - session_start

        seg = build_segment_dict(
            seg_idx,
            text,
            max(0, now - 2),
            now,
            is_user=True,
            speaker_id="realtime",
        )
        if is_final:
            seg_idx += 1
        try:
            if (
                websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(build_transcript_event(session_id, [seg]))
        except Exception as exc:
            logger.debug(f"Failed to send transcript event: {exc}")

        if is_final and text.strip():
            if second_pass_processor is None:
                await _publish_final_perception(text, is_realtime=True)
            second_pass_runner.note_final(len(audio_chunks))

    result_queue: asyncio.Queue[tuple[str, bool]] = asyncio.Queue()

    def on_asr_result(text: str, is_final: bool):
        result_queue.put_nowait((text, is_final))

    def on_asr_error(err: Exception):
        logger.error(f"[omi-compat] ASR error: {err}")
        asr_cancel_event.set()

    async def _result_forwarder():
        """Forward ASR results to the WebSocket."""
        while is_connected:
            try:
                text, is_final = await asyncio.wait_for(result_queue.get(), timeout=1.0)
                await _on_result_async(text, is_final)
            except TimeoutError:
                continue
            except Exception:
                logger.exception("[omi-compat] _result_forwarder error, stopping")
                break

    def _drain_audio_queue():
        """Discard stale audio data so the next ASR session starts clean."""
        dropped = 0
        while not audio_q.empty():
            try:
                item = audio_q.get_nowait()
                if item is None:
                    audio_q.put_nowait(None)
                    break
                dropped += 1
            except asyncio.QueueEmpty:
                break
        if dropped:
            logger.debug(f"[omi-compat] Drained {dropped} stale audio chunks before ASR retry")

    async def _asr_task():
        retry_count = 0
        while is_connected:
            try:
                asr_cancel_event.clear()
                if retry_count > 0:
                    _drain_audio_queue()
                    logger.info(f"[omi-compat] ASR reconnecting (attempt {retry_count + 1})...")
                    await asyncio.sleep(1.0)
                await asr.transcribe_stream(
                    _audio_generator(),
                    on_result=on_asr_result,
                    on_error=on_asr_error,
                )
                if not is_connected:
                    break
                retry_count += 1
                logger.info("[omi-compat] ASR stream ended while client connected, will retry")
            except Exception as e:
                logger.error(f"[omi-compat] ASR task exception: {e}")
                if not is_connected:
                    break
                retry_count += 1
                await asyncio.sleep(2.0)

    async def _receive_loop():
        nonlocal is_connected
        try:
            while is_connected:
                raw = await websocket.receive()
                if raw.get("type") == "websocket.disconnect":
                    break
                data = raw.get("bytes")
                if data:
                    pcm = decode_fn(data) if decode_fn else data
                    audio_chunks.append(pcm)
                    if speaker_diarizer is not None:
                        speaker_diarizer.feed_audio(pcm)
                    with contextlib.suppress(asyncio.QueueFull):
                        audio_q.put_nowait(pcm)
                # Handle text messages (stop signal etc.)
                text_data = raw.get("text")
                if text_data:
                    try:
                        msg = json.loads(text_data)
                        if msg.get("type") == "stop":
                            logger.info("[omi-compat] Client sent stop signal")
                            break
                    except (json.JSONDecodeError, AttributeError):
                        pass
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(f"[omi-compat] receive loop error: {e}")
        finally:
            is_connected = False
            audio_q.put_nowait(None)  # signal ASR to stop

    # ---- Run all tasks concurrently ----

    tasks = [
        asyncio.create_task(_receive_loop()),
        asyncio.create_task(_asr_task()),
        asyncio.create_task(_result_forwarder()),
    ]
    if second_pass_processor is not None:
        tasks.append(asyncio.create_task(second_pass_runner.timer_loop()))

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        is_connected = False
        for t in tasks:
            if not t.done():
                t.cancel()

        await second_pass_runner.final_flush()

        if speaker_diarizer is not None:
            speaker_diarizer.stop()

        # Notify client that the conversation ended
        try:
            if (
                websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(build_last_conversation_event(session_id))
        except Exception as exc:
            logger.debug(f"Failed to send final conversation event: {exc}")

        logger.info(f"[omi-compat] /v4/listen closed  session={session_id}")
