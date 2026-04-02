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
import time
import uuid
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from perception.models import SourceType
from routers.omi_compat.auth import verify_ws_token
from util.logging_config import get_logger

if TYPE_CHECKING:
    from services.speaker_service import SpeakerMatch

logger = get_logger()

router = APIRouter()

# ---------------------------------------------------------------------------
# Audio decoder helpers
# ---------------------------------------------------------------------------

opuslib = None
_opus_available = False


def _patch_find_library_for_homebrew():
    """Monkey-patch ``ctypes.util.find_library`` to also search Homebrew lib paths.

    On Apple Silicon macOS, ``find_library('opus')`` returns *None* even when
    libopus is installed via Homebrew.  This patch makes it fall back to
    well-known Homebrew directories so that ``opuslib`` can locate the shared
    library.  The original function is restored after ``opuslib`` is imported.
    """
    import ctypes.util
    import os
    import sys

    if sys.platform != "darwin":
        return ctypes.util.find_library  # no-op on non-macOS

    _orig = ctypes.util.find_library

    def _find_library_homebrew(name: str) -> str | None:
        result = _orig(name)
        if result is None:
            for prefix in ("/opt/homebrew/lib", "/usr/local/lib"):
                candidate = os.path.join(prefix, f"lib{name}.dylib")
                if os.path.isfile(candidate):
                    return candidate
        return result

    ctypes.util.find_library = _find_library_homebrew
    return _orig


_orig_find_library = _patch_find_library_for_homebrew()
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
        logger.warning("opuslib unavailable — Opus audio decoding disabled")
finally:
    import ctypes.util

    ctypes.util.find_library = _orig_find_library


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

    # pcm16 / pcm pass-through
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
        from services.asr_client import ASRClient

        asr = ASRClient()
    except Exception as e:
        logger.error(f"[omi-compat] Failed to create ASR client: {e}")
        await websocket.close(code=1011, reason=str(e)[:120])
        return

    # Shared audio processor (speaker diarization + second-pass + perception)
    from services.audio_session import SharedAudioProcessor

    processor = SharedAudioProcessor(
        source_type=SourceType.MIC_HARDWARE,
        session_id=session_id,
        endpoint="/v4/listen",
        uid=uid,
    )

    # Shared state
    seg_idx = 0
    session_start = time.monotonic()
    is_connected = True

    # Audio queue fed by the receive loop, consumed by ASR
    audio_q: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=500)
    # Accumulated raw PCM for second-pass offline ASR
    audio_chunks: list[bytes] = []
    second_pass_cursor = 0  # index into audio_chunks marking last processed position
    # Chunk index at the moment of the most recent is_final — used as the end
    # boundary for second-pass so that audio is always sliced at sentence edges.
    latest_final_chunk_idx = 0

    sp_min_text_len = 4
    sp_timeout = 120
    _sp_pending_text: list[str] = []

    asr_cancel_event = asyncio.Event()
    # Fired by _on_result_async(is_final=True) to wake the second-pass debounce loop
    second_pass_trigger = asyncio.Event()

    async def _identify_speaker_for_segment() -> SpeakerMatch | None:
        return await processor.identify_current_speaker()

    def _resolve_speaker(speaker_info: SpeakerMatch | None) -> tuple[str | None, int | None]:
        return SharedAudioProcessor.resolve_speaker(speaker_info)

    async def _publish_final_perception(
        text: str,
        *,
        is_realtime: bool = True,
        speaker_tag: str | None = None,
        speaker_id: int | None = None,
    ) -> None:
        await processor.publish_perception(
            text,
            is_realtime=is_realtime,
            speaker_tag=speaker_tag,
            speaker_id=speaker_id,
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
        nonlocal seg_idx, latest_final_chunk_idx
        if not text or not is_connected:
            return
        now = time.monotonic() - session_start

        # v1 (real-time): no speaker identification — will be refined by second pass
        seg = _segment_dict(
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
                await websocket.send_json(_transcript_event(session_id, [seg]))
        except Exception as exc:
            logger.debug(f"Failed to send transcript event: {exc}")

        if is_final and text.strip():
            if second_pass_processor is None:
                await _publish_final_perception(text, is_realtime=True)
            latest_final_chunk_idx = len(audio_chunks)
            _sp_pending_text.append(text)
            merged = "".join(_sp_pending_text)
            if len(merged.strip()) >= sp_min_text_len:
                second_pass_trigger.set()
            logger.info(
                "[omi-compat] is_final received: chunks=%d cursor=%d text=%.40s",
                latest_final_chunk_idx,
                second_pass_cursor,
                text.strip()[:40],
            )

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
                    processor.feed_audio(pcm)
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

    # ---- Second-pass offline ASR (v2 refinement) via shared processor ----

    second_pass_processor = processor.second_pass_processor
    sp_debounce = processor.sp_debounce
    sp_max_wait = processor.sp_max_wait

    async def _send_refined_segments(result) -> None:
        """Push v2 refined segments to the WebSocket client and perception."""
        if result is None or not result.segments:
            return

        refined_segs = []
        for i, seg in enumerate(result.segments):
            refined_segs.append(
                _segment_dict(
                    i,
                    seg.text,
                    seg.begin_time_ms / 1000.0,
                    seg.end_time_ms / 1000.0,
                    is_user=True,
                    speaker_id=seg.speaker_name or f"说话人 {seg.speaker_id}",
                )
            )

        try:
            if (
                websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(
                    {
                        "type": "transcript_refined",
                        "session_id": session_id,
                        "segments": refined_segs,
                    }
                )
                logger.info(f"[omi-compat] Sent {len(refined_segs)} refined segments to client")
        except Exception as exc:
            logger.debug(f"[omi-compat] Failed to send refined transcript: {exc}")

        for seg in result.segments:
            if seg.text.strip():
                await _publish_final_perception(
                    seg.text,
                    is_realtime=False,
                    speaker_tag=seg.speaker_name,
                    speaker_id=seg.speaker_id,
                )

    async def _run_second_pass(chunks_slice: list[bytes]) -> None:
        """Execute one second-pass processing run with timeout protection."""
        try:
            result = await asyncio.wait_for(
                processor.run_second_pass(chunks_slice),
                timeout=sp_timeout,
            )
        except TimeoutError:
            logger.warning(f"[omi-compat] Second-pass timed out after {sp_timeout}s, skipping")
            return
        await _send_refined_segments(result)

    async def _second_pass_timer():
        """Trigger second-pass after is_final with a short debounce.

        Audio is always sliced at sentence boundaries (``latest_final_chunk_idx``)
        so DashScope receives complete utterances rather than arbitrary fragments.

        Waits for the first ``is_final`` signal, then debounces for
        ``sp_debounce`` seconds (resets on each new signal) before
        submitting.  A hard cap of ``sp_max_wait`` since the last
        submission prevents unbounded delays during continuous speech.
        """
        nonlocal second_pass_cursor
        if second_pass_processor is None:
            return

        last_run = time.monotonic()

        while is_connected:
            # Wait for the first is_final signal (or max_wait as fallback)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(second_pass_trigger.wait(), timeout=sp_max_wait)

            if not is_connected:
                break
            second_pass_trigger.clear()

            # Debounce: keep waiting while new finals arrive within sp_debounce
            deadline = time.monotonic() + sp_debounce
            max_deadline = last_run + sp_max_wait
            while is_connected and time.monotonic() < min(deadline, max_deadline):
                remaining = min(deadline, max_deadline) - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    await asyncio.wait_for(second_pass_trigger.wait(), timeout=remaining)
                    second_pass_trigger.clear()
                    deadline = time.monotonic() + sp_debounce  # reset debounce
                except TimeoutError:
                    break

            if not is_connected:
                break

            # Slice audio at the last sentence boundary, not at the current
            # stream position, to avoid sending partial utterances.
            end = latest_final_chunk_idx
            if end <= second_pass_cursor:
                logger.debug(
                    "[omi-compat] Second-pass skip: end=%d <= cursor=%d",
                    end,
                    second_pass_cursor,
                )
                continue
            chunks_slice = audio_chunks[second_pass_cursor:end]
            start = second_pass_cursor
            second_pass_cursor = end
            _sp_pending_text.clear()
            last_run = time.monotonic()
            logger.info(
                f"[omi-compat] Second-pass triggered (debounce): processing chunks [{start}:{end}]"
            )
            await _run_second_pass(chunks_slice)

    async def _second_pass_final():
        """Run second-pass on any remaining unprocessed audio at disconnect.

        At disconnect we use ``latest_final_chunk_idx`` as the end boundary
        (same sentence-alignment logic).  Any trailing audio after the last
        ``is_final`` is intentionally excluded — it's incomplete speech.
        """
        nonlocal second_pass_cursor
        if second_pass_processor is None:
            return
        end = latest_final_chunk_idx
        if end <= second_pass_cursor:
            return
        chunks_slice = audio_chunks[second_pass_cursor:end]
        start = second_pass_cursor
        second_pass_cursor = end
        logger.info(f"[omi-compat] Second-pass final: processing chunks [{start}:{end}]")
        await _run_second_pass(chunks_slice)

    # ---- Run all tasks concurrently ----

    tasks = [
        asyncio.create_task(_receive_loop()),
        asyncio.create_task(_asr_task()),
        asyncio.create_task(_result_forwarder()),
    ]
    if second_pass_processor is not None:
        tasks.append(asyncio.create_task(_second_pass_timer()))

    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        is_connected = False
        for t in tasks:
            if not t.done():
                t.cancel()

        # Run final second-pass on remaining audio before closing
        await _second_pass_final()

        processor.stop()

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
            logger.debug(f"Failed to send final conversation event: {exc}")

        logger.info(f"[omi-compat] /v4/listen closed  session={session_id}")
