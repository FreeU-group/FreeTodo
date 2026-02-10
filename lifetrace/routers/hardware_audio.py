"""硬件设备音频接入路由

将外部硬件设备（通过 HTTP POST webhook）作为新的音频数据源，
复用现有 ASR + LLM 优化 + 待办提取 + 存储管线。
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request

from lifetrace.services.asr_client import ASRClient
from lifetrace.services.audio_service import AudioService
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

# 硬件会话超时（秒）：超过此时间没收到新音频，自动结束会话并保存
HARDWARE_SESSION_TIMEOUT = 15.0


class HardwareAudioSession:
    """单个硬件设备的音频会话，桥接 HTTP POST → 异步 ASR 流。"""

    def __init__(
        self,
        uid: str,
        sample_rate: int,
        asr_client: ASRClient,
        audio_service: AudioService,
    ) -> None:
        self.uid = uid
        self.sample_rate = sample_rate
        self.asr_client = asr_client
        self.audio_service = audio_service

        self.audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.audio_chunks: list[bytes] = []
        self.transcription_lines: list[str] = []
        self.started_at = get_utc_now()
        self.last_audio_time = time.monotonic()

        self._task: asyncio.Task[None] | None = None
        self._recording_id: int | None = None  # 录音记录 ID
        self._update_tasks: set[asyncio.Task] = set()  # 跟踪后台更新任务

    # ------------------------------------------------------------------
    @property
    def is_active(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        """启动 ASR 流式识别后台任务。"""
        self._task = asyncio.create_task(self._run())

    async def add_audio(self, pcm_bytes: bytes) -> None:
        """接收一个 HTTP POST 传来的 PCM 音频块。"""
        self.audio_chunks.append(pcm_bytes)
        self.last_audio_time = time.monotonic()
        await self.audio_queue.put(pcm_bytes)

    # ------------------------------------------------------------------
    async def _audio_generator(self):
        """异步生成器：从队列中读取音频块，超时则结束流。"""
        while True:
            try:
                chunk = await asyncio.wait_for(
                    self.audio_queue.get(), timeout=HARDWARE_SESSION_TIMEOUT
                )
                if chunk is None:
                    break
                yield chunk
            except TimeoutError:
                logger.info(
                    f"[hardware] 设备 {self.uid} 已 {HARDWARE_SESSION_TIMEOUT}s 无音频，结束会话"
                )
                break

    async def _run(self) -> None:
        """运行 ASR 并实时更新转录文本。"""
        try:
            logger.info(f"[hardware] 设备 {self.uid} 开始新会话")

            def on_result(text: str, is_final: bool) -> None:
                if is_final and text.strip():
                    self.transcription_lines.append(text.strip())
                    logger.info(f"[hardware] ✓ {text}")
                    # 实时更新转录文本
                    task = asyncio.create_task(self._update_transcription())
                    self._update_tasks.add(task)
                    task.add_done_callback(self._update_tasks.discard)

            await self.asr_client.transcribe_stream(
                audio_stream=self._audio_generator(),
                on_result=on_result,
            )
        except Exception as e:
            logger.error(f"[hardware] ASR 失败: {e}", exc_info=True)
        finally:
            await self._finalize()

    async def _ensure_recording_created(self) -> int:
        """确保录音记录已创建（第一次调用时创建临时记录）。"""
        if self._recording_id is not None:
            return self._recording_id

        # 创建临时录音记录（status="recording"）
        temp_path = self.audio_service.generate_audio_file_path(self.started_at)
        self._recording_id = self.audio_service.create_recording(
            file_path=str(temp_path),
            file_size=0,  # 先占位，结束时更新
            duration=0.0,  # 先占位，结束时更新
            is_24x7=False,
        )
        logger.info(f"[hardware] 创建临时录音记录: recording_id={self._recording_id}")
        return self._recording_id

    async def _update_transcription(self) -> None:
        """更新转录文本（实时）。"""
        try:
            recording_id = await self._ensure_recording_created()
            transcription_text = "\n".join(self.transcription_lines)
            if transcription_text.strip():
                marked_text = f"🎙️ [硬件设备]\n{transcription_text}"
                await self.audio_service.save_transcription(
                    recording_id=recording_id,
                    original_text=marked_text,
                    auto_optimize=False,
                )
        except Exception as e:
            logger.error(f"[hardware] 更新转录失败: {e}", exc_info=True)

    async def _finalize(self) -> None:
        """会话结束：保存 WAV 文件和转录文本。"""
        try:
            if not self.audio_chunks:
                logger.info(f"[hardware] 设备 {self.uid} 无音频数据，跳过保存")
                return

            from lifetrace.routers.audio_ws import (  # noqa: PLC0415
                _apply_agc_to_pcm,
                _pcm16le_to_wav,
            )

            pcm_bytes = b"".join(self.audio_chunks)
            duration = len(pcm_bytes) / (self.sample_rate * 2)  # 16-bit mono

            pcm_bytes = _apply_agc_to_pcm(logger, pcm_bytes)
            wav_bytes = _pcm16le_to_wav(pcm_bytes, sample_rate=self.sample_rate)

            # 保存 WAV 文件
            file_path = self.audio_service.generate_audio_file_path(self.started_at)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(wav_bytes)

            # 如果已有录音记录，更新文件信息；否则创建新记录
            if self._recording_id is not None:
                recording_id = self._recording_id
                # 更新文件大小和时长
                from lifetrace.storage import get_session  # noqa: PLC0415
                from lifetrace.storage.models import AudioRecording  # noqa: PLC0415

                with get_session() as session:
                    rec = session.get(AudioRecording, recording_id)
                    if rec:
                        rec.file_path = str(file_path)
                        rec.file_size = len(wav_bytes)
                        rec.duration = duration
                        session.commit()
            else:
                # 没有识别到任何文本的情况，创建新记录
                recording_id = self.audio_service.create_recording(
                    file_path=str(file_path),
                    file_size=len(wav_bytes),
                    duration=duration,
                    is_24x7=False,
                )

            # 完成录音
            self.audio_service.complete_recording(recording_id)

            # 保存最终转录（不做 LLM 优化）
            if self.transcription_lines:
                transcription_text = "\n".join(self.transcription_lines)
                marked_text = f"🎙️ [硬件设备]\n{transcription_text}"
                await self.audio_service.save_transcription(
                    recording_id=recording_id,
                    original_text=marked_text,
                    auto_optimize=False,
                )

            logger.info(
                f"[hardware] ✅ 会话保存: recording_id={recording_id}, "
                f"duration={duration:.1f}s, sentences={len(self.transcription_lines)}"
            )
        except Exception as e:
            logger.error(f"[hardware] 保存失败: {e}", exc_info=True)


# ==================== 全局会话管理 ====================
_sessions: dict[str, HardwareAudioSession] = {}
_sessions_lock = asyncio.Lock()


async def _get_or_create_session(
    uid: str,
    sample_rate: int,
    asr_client: ASRClient,
    audio_service: AudioService,
) -> HardwareAudioSession:
    """获取或创建设备会话。"""
    async with _sessions_lock:
        session = _sessions.get(uid)
        if session and session.is_active:
            return session

        # 清理已完成的旧会话
        if session and not session.is_active:
            del _sessions[uid]

        # 创建新会话
        session = HardwareAudioSession(
            uid=uid,
            sample_rate=sample_rate,
            asr_client=asr_client,
            audio_service=audio_service,
        )
        _sessions[uid] = session
        await session.start()
        return session


# ==================== 路由注册 ====================
def register_hardware_audio_routes(
    *,
    router: APIRouter,
    asr_client: ASRClient,
    audio_service: AudioService,
) -> None:
    """将硬件音频端点注册到路由。"""

    @router.post("/hardware/audio")
    async def receive_hardware_audio(
        request: Request, uid: str, sample_rate: int = 16000
    ) -> dict[str, Any]:
        """接收硬件设备的音频数据。

        参数:
        - uid: 设备/用户 ID
        - sample_rate: 采样率（默认 16000 Hz）

        音频格式: PCM16 LE, 单声道
        """
        audio_bytes = await request.body()
        if not audio_bytes:
            return {"status": "error", "message": "empty audio data"}

        duration = len(audio_bytes) / (sample_rate * 2)

        # 获取或创建会话，送入音频
        session = await _get_or_create_session(uid, sample_rate, asr_client, audio_service)
        await session.add_audio(audio_bytes)

        return {
            "status": "success",
            "bytes_received": len(audio_bytes),
            "duration_seconds": round(duration, 2),
        }

    @router.get("/hardware/status")
    async def hardware_status() -> dict[str, Any]:
        """查看活跃的硬件设备会话。"""
        active = []
        for uid, session in _sessions.items():
            if session.is_active:
                elapsed = time.monotonic() - session.last_audio_time
                active.append(
                    {
                        "uid": uid,
                        "sentences": len(session.transcription_lines),
                        "chunks": len(session.audio_chunks),
                        "idle_seconds": round(elapsed, 1),
                    }
                )
        return {"active_sessions": active, "total": len(active)}
