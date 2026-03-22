"""本地麦克风采集服务

使用 sounddevice 在 Python 后端直接采集 PC 麦克风音频，
替代浏览器 getUserMedia 方案，提供更稳定的 7x24 录音能力。

架构：sounddevice 回调 (audio thread) → asyncio Queue → ASR 流 → 转录/感知/推送
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from typing import TYPE_CHECKING, Any

from util.audio_utils import apply_agc_to_pcm, pcm16le_to_wav
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from fastapi import WebSocket

    from services.asr_client import ASRClient
    from services.audio_service import AudioService

logger = get_logger()

SAMPLE_RATE = 16000
CHANNELS = 1
BLOCK_SIZE = 1024


def _track(task_set: set[asyncio.Task], coro: Any) -> asyncio.Task:
    task = asyncio.create_task(coro)
    task_set.add(task)
    task.add_done_callback(task_set.discard)
    return task


class LocalMicCapture:
    """单次本地麦克风采集会话，桥接 sounddevice → ASR 流式转录。"""

    def __init__(
        self,
        asr_client: ASRClient,
        audio_service: AudioService,
        *,
        device: int | None = None,
    ) -> None:
        self.asr_client = asr_client
        self.audio_service = audio_service
        self.device = device

        self._audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._audio_chunks: list[bytes] = []
        self._transcription_lines: list[str] = []
        self._started_at = get_utc_now()
        self._recording_id: int | None = None
        self._is_24x7 = False

        self._stream: Any = None  # sd.InputStream
        self._asr_task: asyncio.Task[None] | None = None
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

        self._subscribers: set[WebSocket] = set()
        self._bg_tasks: set[asyncio.Task] = set()

        self._nlp_buffer = ""
        self._nlp_last_emit = 0.0
        self._nlp_pending: asyncio.Task[None] | None = None
        self._nlp_throttle_seconds = 8.0

    @property
    def is_active(self) -> bool:
        return self._running and self._stream is not None

    # ── subscriber management ──────────────────────────────────────

    def subscribe(self, ws: WebSocket) -> None:
        self._subscribers.add(ws)

    def unsubscribe(self, ws: WebSocket) -> None:
        self._subscribers.discard(ws)

    # ── lifecycle ──────────────────────────────────────────────────

    async def start(self, *, is_24x7: bool = False) -> None:
        if self._running:
            return

        import sounddevice as sd  # noqa: PLC0415

        self._running = True
        self._loop = asyncio.get_running_loop()
        self._started_at = get_utc_now()
        self._is_24x7 = is_24x7

        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=BLOCK_SIZE,
            device=self.device,
            callback=self._audio_callback,
        )
        self._stream.start()
        logger.info(f"[local-mic] Capture started (device={self.device})")

        self._asr_task = asyncio.create_task(self._run_asr())

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False

        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

        await self._audio_queue.put(None)

        if self._asr_task and not self._asr_task.done():
            with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(self._asr_task, timeout=10.0)

        logger.info("[local-mic] Capture stopped")

    # ── sounddevice callback (audio thread) ────────────────────────

    def _audio_callback(self, indata: Any, _frames: int, _time: Any, status: Any) -> None:
        if status:
            logger.warning(f"[local-mic] sounddevice status: {status}")
        if not self._running:
            return
        pcm_bytes: bytes = indata.tobytes()
        self._audio_chunks.append(pcm_bytes)
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._audio_queue.put_nowait, pcm_bytes)

    # ── ASR ────────────────────────────────────────────────────────

    async def _audio_generator(self):
        while self._running:
            try:
                chunk = await asyncio.wait_for(self._audio_queue.get(), timeout=5.0)
                if chunk is None:
                    break
                yield apply_agc_to_pcm(logger, chunk, log_stats=False, warn_silence=False)
            except TimeoutError:
                if not self._running:
                    break

    async def _run_asr(self) -> None:
        try:

            def on_result(text: str, is_final: bool) -> None:
                if not text:
                    return
                # 广播给所有订阅者（包括 partial）
                _track(self._bg_tasks, self._broadcast_result(text, is_final))
                if is_final and text.strip():
                    self._transcription_lines.append(text.strip())
                    logger.info(f"[local-mic] ✓ {text}")
                    _track(self._bg_tasks, self._update_transcription())
                    _track(self._bg_tasks, self._publish_perception(text.strip()))
                    self._on_final_sentence_nlp(text.strip())

            def on_error(error: Exception) -> None:
                logger.error(f"[local-mic] ASR error: {error}")
                _track(self._bg_tasks, self._broadcast_error(str(error)))

            await self.asr_client.transcribe_stream(
                audio_stream=self._audio_generator(),
                on_result=on_result,
                on_error=on_error,
            )
        except Exception as exc:
            logger.error(f"[local-mic] ASR failed: {exc}", exc_info=True)
        finally:
            await self._finalize()

    # ── realtime NLP (todo extraction) ─────────────────────────────

    def _on_final_sentence_nlp(self, text: str) -> None:
        if self._nlp_buffer:
            self._nlp_buffer += "\n"
        self._nlp_buffer += text

        now = time.monotonic()
        elapsed = now - self._nlp_last_emit
        if elapsed >= self._nlp_throttle_seconds:
            self._nlp_last_emit = now
            _track(self._bg_tasks, self._run_nlp_once())
            return

        if self._nlp_pending is None:
            delay = max(0.0, self._nlp_throttle_seconds - elapsed)
            self._nlp_pending = _track(self._bg_tasks, self._run_nlp_debounced(delay))

    async def _run_nlp_debounced(self, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
            await self._run_nlp_once()
        finally:
            self._nlp_pending = None

    async def _run_nlp_once(self) -> None:
        snapshot = self._nlp_buffer.strip()
        if not snapshot:
            return
        try:
            extracted = await self.audio_service.extraction_service.extract_todos(snapshot)
            todos = extracted.get("todos", [])
            logger.info(f"[local-mic] NLP extracted {len(todos)} todos")
            await self._broadcast(
                {
                    "header": {"name": "ExtractionChanged"},
                    "payload": {"todos": todos, "schedules": []},
                }
            )
        except Exception as exc:
            logger.error(f"[local-mic] NLP extraction failed: {exc}")

    # ── broadcast ──────────────────────────────────────────────────

    async def _broadcast_result(self, text: str, is_final: bool) -> None:
        await self._broadcast(
            {
                "header": {"name": "TranscriptionResultChanged"},
                "payload": {"result": text, "is_final": is_final},
            }
        )

    async def _broadcast_error(self, error: str) -> None:
        await self._broadcast(
            {
                "header": {"name": "TaskFailed"},
                "payload": {"error": error},
            }
        )

    async def _broadcast(self, message: dict[str, Any]) -> None:
        dead: set[WebSocket] = set()
        for ws in self._subscribers:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self._subscribers -= dead

    # ── perception ─────────────────────────────────────────────────

    async def _publish_perception(self, text: str) -> None:
        try:
            from perception.manager import try_get_perception_manager  # noqa: PLC0415
            from perception.models import SourceType  # noqa: PLC0415

            mgr = try_get_perception_manager()
            if mgr is None:
                return
            await mgr.try_publish_audio_transcription(
                text,
                metadata={"source": "local_mic"},
                source=SourceType.MIC_PC,
            )
        except Exception:
            return

    # ── persistence ────────────────────────────────────────────────

    async def _ensure_recording_created(self) -> int:
        if self._recording_id is not None:
            return self._recording_id
        temp_path = self.audio_service.generate_audio_file_path(self._started_at)
        self._recording_id = self.audio_service.create_recording(
            file_path=str(temp_path),
            file_size=0,
            duration=0.0,
            is_24x7=self._is_24x7,
        )
        logger.info(f"[local-mic] Created recording: recording_id={self._recording_id}")
        return self._recording_id

    async def _update_transcription(self) -> None:
        try:
            recording_id = await self._ensure_recording_created()
            text = "\n".join(self._transcription_lines)
            if text.strip():
                await self.audio_service.save_transcription(
                    recording_id=recording_id,
                    original_text=text,
                )
        except Exception as exc:
            logger.error(f"[local-mic] Update transcription failed: {exc}", exc_info=True)

    async def _finalize(self) -> None:
        try:
            if not self._audio_chunks:
                logger.info("[local-mic] No audio data, skip save")
                return

            pcm_bytes = b"".join(self._audio_chunks)
            duration = len(pcm_bytes) / (SAMPLE_RATE * 2)  # 16-bit mono

            pcm_bytes = apply_agc_to_pcm(logger, pcm_bytes)
            wav_bytes = pcm16le_to_wav(pcm_bytes, sample_rate=SAMPLE_RATE)

            file_path = self.audio_service.generate_audio_file_path(self._started_at)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(wav_bytes)

            if self._recording_id is not None:
                from storage import get_session  # noqa: PLC0415
                from storage.models import AudioRecording  # noqa: PLC0415

                with get_session() as session:
                    rec = session.get(AudioRecording, self._recording_id)
                    if rec:
                        rec.file_path = str(file_path)
                        rec.file_size = len(wav_bytes)
                        rec.duration = duration
                        session.commit()
            else:
                self._recording_id = self.audio_service.create_recording(
                    file_path=str(file_path),
                    file_size=len(wav_bytes),
                    duration=duration,
                    is_24x7=self._is_24x7,
                )

            self.audio_service.complete_recording(self._recording_id)

            if self._transcription_lines:
                text = "\n".join(self._transcription_lines)
                await self.audio_service.save_transcription(
                    recording_id=self._recording_id,
                    original_text=text,
                )

            logger.info(
                f"[local-mic] ✅ Saved: recording_id={self._recording_id}, "
                f"duration={duration:.1f}s, sentences={len(self._transcription_lines)}"
            )
        except Exception as exc:
            logger.error(f"[local-mic] Save failed: {exc}", exc_info=True)

    # ── status ─────────────────────────────────────────────────────

    def get_status(self) -> dict[str, Any]:
        return {
            "is_active": self.is_active,
            "device": self.device,
            "sentences": len(self._transcription_lines),
            "chunks": len(self._audio_chunks),
            "subscribers": len(self._subscribers),
            "recording_id": self._recording_id,
            "is_24x7": self._is_24x7,
        }


# ==================== 全局实例管理 ====================

_capture: LocalMicCapture | None = None
_capture_lock = asyncio.Lock()


async def get_or_create_capture(
    asr_client: ASRClient,
    audio_service: AudioService,
    *,
    device: int | None = None,
) -> LocalMicCapture:
    global _capture  # noqa: PLW0603
    async with _capture_lock:
        if _capture and _capture.is_active:
            return _capture
        _capture = LocalMicCapture(asr_client, audio_service, device=device)
        return _capture


async def get_capture() -> LocalMicCapture | None:
    return _capture


def list_audio_devices() -> list[dict[str, Any]]:
    """列出所有可用的音频输入设备。"""
    import sounddevice as sd  # noqa: PLC0415

    devices = sd.query_devices()
    result: list[dict[str, Any]] = []
    default_input = sd.default.device[0] if isinstance(sd.default.device, tuple) else None
    for i, dev in enumerate(devices):  # type: ignore[arg-type]
        if dev["max_input_channels"] > 0:  # type: ignore[index]
            result.append(
                {
                    "index": i,
                    "name": dev["name"],  # type: ignore[index]
                    "channels": dev["max_input_channels"],  # type: ignore[index]
                    "sample_rate": dev["default_samplerate"],  # type: ignore[index]
                    "is_default": i == default_input,
                }
            )
    return result
