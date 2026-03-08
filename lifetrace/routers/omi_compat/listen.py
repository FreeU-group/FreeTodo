"""WebSocket ``/v4/listen`` 鈥?omi-compatible real-time audio transcription.

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
import time
import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from lifetrace.perception.manager import try_get_perception_manager
from lifetrace.perception.models import Modality, PerceptionEvent, SourceType
from lifetrace.routers.omi_compat.auth import verify_ws_token
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter()

# ---------------------------------------------------------------------------
# Audio decoder helpers
# ---------------------------------------------------------------------------

opuslib = None
_opus_available = False
try:
    import opuslib  # type: ignore[import-untyped]

    _opus_available = True
except (ImportError, Exception):
    import os
    import sys

    try:
        import pyogg  # type: ignore[import-untyped]

        pyogg_dir = os.path.dirname(pyogg.__file__)
        if pyogg_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = pyogg_dir + os.pathsep + os.environ.get("PATH", "")
            if sys.platform == "win32":
                os.add_dll_directory(pyogg_dir)
        import opuslib  # type: ignore[import-untyped]

        _opus_available = True
    except Exception:
        logger.warning("opuslib unavailable 鈥?Opus audio decoding disabled")


class _OpusDecoder:
    """Thin wrapper around ``opuslib`` for 16 kHz mono Opus frames."""

    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        if not _opus_available or opuslib is None:
            raise RuntimeError("opuslib is not installed 鈥?run: pip install opuslib")
        self._dec = opuslib.Decoder(sample_rate, channels)
        self._frame_size = sample_rate // 50  # 20 ms frames 鈫?320 samples

    def decode(self, data: bytes) -> bytes:
        """Decode one Opus packet 鈫?PCM-16 LE bytes."""
        return self._dec.decode(data, self._frame_size)


def _pcm8_to_pcm16(data: bytes) -> bytes:
    """Up-sample 8 kHz PCM-16 LE to 16 kHz by simple sample doubling."""
    import array

    samples = array.array("h")
    samples.frombytes(data)
    out = array.array("h")
    for s in samples:
        out.append(s)
        out.append(s)
    return out.tobytes()


def _build_decoder(codec: str, sample_rate: int):
    """Return ``(decode_fn, effective_sample_rate)``."""
    if codec in ("opus", "opus_fs320"):
        dec = _OpusDecoder(sample_rate=sample_rate)
        return dec.decode, sample_rate

    if codec == "pcm8":
        return _pcm8_to_pcm16, 16000

    # pcm16 / pcm 鈥?pass-through
    return None, sample_rate


# ---------------------------------------------------------------------------
# omi MessageEvent builders
# ---------------------------------------------------------------------------


def _transcript_event(
    session_id: str,
    segments: list[dict],
) -> dict:
    return {
        "type": "transcript",
        "session_id": session_id,
        "segments": segments,
    }


def _segment_dict(
    idx: int,
    text: str,
    start: float,
    end: float,
    *,
    is_user: bool = True,
    speaker_id: str = "SPEAKER_00",
) -> dict:
    return {
        "id": idx,
        "text": text,
        "speaker_id": speaker_id,
        "is_user": is_user,
        "person_id": None,
        "start": round(start, 2),
        "end": round(end, 2),
    }


# ---------------------------------------------------------------------------
# Main WebSocket handler
# ---------------------------------------------------------------------------


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
        decode_fn, _effective_sr = _build_decoder(codec, sample_rate)
    except Exception as e:
        logger.error(f"[omi-compat] Failed to build audio decoder (codec={codec}): {e}")
        await websocket.close(code=1011, reason=str(e)[:120])
        return

    # ASR plumbing — lazy import to avoid hard dep at module level
    try:
        from lifetrace.services.asr_client import ASRClient

        asr = ASRClient()
    except Exception as e:
        logger.error(f"[omi-compat] Failed to create ASR client: {e}")
        await websocket.close(code=1011, reason=str(e)[:120])
        return

    # Shared state
    seg_idx = 0
    session_start = time.monotonic()
    is_connected = True

    # Audio queue fed by the receive loop, consumed by ASR
    audio_q: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=500)

    asr_cancel_event = asyncio.Event()

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
        seg = _segment_dict(seg_idx, text, max(0, now - 2), now, is_user=True)
        if is_final:
            seg_idx += 1
        try:
            if (
                websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(_transcript_event(session_id, [seg]))
        except Exception as exc:
            logger.debug("Failed to send transcript event: %s", exc)

        if is_final and text.strip():
            mgr = try_get_perception_manager()
            if mgr is not None:
                event = PerceptionEvent(
                    timestamp=get_utc_now(),
                    source=SourceType.MIC_HARDWARE,
                    modality=Modality.AUDIO,
                    content_text=text.strip(),
                    metadata={
                        "session_id": session_id,
                        "uid": uid,
                        "source_endpoint": "/v4/listen",
                    },
                    priority=2,
                )
                await mgr.publish_event(event)

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
                    with contextlib.suppress(asyncio.QueueFull):
                        audio_q.put_nowait(pcm)
                # Handle text messages (stop signal etc.)
                text_data = raw.get("text")
                if text_data:
                    import json

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

    # Run all tasks concurrently
    tasks = [
        asyncio.create_task(_receive_loop()),
        asyncio.create_task(_asr_task()),
        asyncio.create_task(_result_forwarder()),
    ]

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        is_connected = False
        for t in tasks:
            if not t.done():
                t.cancel()

        # Notify client that the conversation ended
        try:
            if (
                websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(
                    {
                        "type": "last_conversation",
                        "conversation_id": session_id,
                    }
                )
        except Exception as exc:
            logger.debug("Failed to send final conversation event: %s", exc)

        logger.info(f"[omi-compat] /v4/listen closed  session={session_id}")
