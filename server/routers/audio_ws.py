"""Audio websocket routes (recording + realtime ASR + realtime NLP).

Split from `lifetrace.routers.audio` to keep router files small and readable.
"""

from __future__ import annotations

import array
import asyncio
import importlib
import json
import time
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from util.audio_utils import apply_agc_to_pcm, pcm16le_to_wav
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Callable

# ---- constants (avoid magic numbers) ----
SAMPLE_RATE = 16000
NUM_CHANNELS = 1
BITS_PER_SAMPLE = 16

PCM_SILENCE_MAX_ABS = 50
PCM_SILENCE_RMS = 20

INT16_MAX = 32767
INT16_MIN = -32768

# ---- Peak-based AGC constants (V1) ----
MAX_AGC_GAIN = 4.0
AGC_APPLY_THRESHOLD_GAIN = 1.05
AGC_TARGET_PEAK_RATIO = 0.85
DURATION_PCM_WALL_RATIO_WARN_THRESHOLD = 0.7

# 分段存储配置
SEGMENT_DURATION_MINUTES = 30  # 30分钟分段
SILENCE_DETECTION_THRESHOLD_SECONDS = 600  # 10分钟静音检测阈值
SILENCE_CHECK_INTERVAL_SECONDS = 60  # 每60秒检查一次静音


def _track_task(task_set: set[asyncio.Task], coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    task_set.add(task)
    task.add_done_callback(task_set.discard)
    return task


def _to_local(dt: datetime | None) -> datetime | None:
    """Convert datetime to local timezone (timezone-aware)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        offset = -time.timezone if time.daylight == 0 else -time.altzone
        local_tz = timezone(timedelta(seconds=offset))
        return dt.replace(tzinfo=local_tz)
    return dt.astimezone()


def _pcm16le_to_wav(
    pcm_data: bytes,
    sample_rate: int = SAMPLE_RATE,
    num_channels: int = NUM_CHANNELS,
    bits_per_sample: int = BITS_PER_SAMPLE,
) -> bytes:
    return pcm16le_to_wav(
        pcm_data,
        sample_rate=sample_rate,
        num_channels=num_channels,
        bits_per_sample=bits_per_sample,
    )


def _is_ws_connected(websocket: WebSocket, is_connected_ref: list[bool]) -> bool:
    """Check if the WebSocket is still connected."""
    return (
        is_connected_ref[0]
        and websocket.application_state == WebSocketState.CONNECTED
        and websocket.client_state == WebSocketState.CONNECTED
    )


def _create_result_callback(  # noqa: C901
    *,
    websocket: WebSocket,
    logger,
    transcription_text_ref: list[str],
    is_connected_ref: list[bool],
    task_set: set[asyncio.Task],
    speaker_diarizer=None,
    speaker_segments_ref: list[list] | None = None,
) -> Callable[[str, bool], None]:
    """Create ASR result callback.

    NOTE: Only commit final sentences to `transcription_text_ref` to avoid duplicates.
    """
    _spk_enabled = speaker_diarizer is not None and speaker_diarizer.enabled

    async def _send_result(
        text: str, is_final: bool, *, speaker_info: dict[str, Any] | None = None
    ) -> None:
        try:
            if _is_ws_connected(websocket, is_connected_ref):
                payload: dict[str, Any] = {"result": text, "is_final": is_final}
                if speaker_info is not None:
                    payload["speaker"] = speaker_info
                await websocket.send_json(
                    {
                        "header": {"name": "TranscriptionResultChanged"},
                        "payload": payload,
                    }
                )
        except Exception as e:
            is_connected_ref[0] = False
            logger.warning(f"Failed to send TranscriptionResultChanged to client: {e}")

    async def _identify_speaker(text: str) -> dict[str, Any] | None:
        """Use the diarizer to identify the current speaker."""
        if not _spk_enabled or speaker_diarizer is None:
            return None
        try:
            result = await speaker_diarizer.identify_current_speaker()
            if result is not None:
                if speaker_segments_ref is not None:
                    speaker_segments_ref[0].append({"text": text, "speaker": result})
                return result
        except Exception as e:
            logger.debug(f"Speaker identification failed: {e}")
        return None

    async def _send_final_with_speaker(text: str) -> None:
        """Identify speaker, then send the final result with speaker info."""
        speaker_info = await _identify_speaker(text)
        await _send_result(text, True, speaker_info=speaker_info)

    def on_result(text: str, is_final: bool) -> None:
        if not text or not _is_ws_connected(websocket, is_connected_ref):
            return

        if is_final:
            committed = transcription_text_ref[0]
            needs_gap = committed and not committed.endswith("\n")
            committed += ("\n" if needs_gap else "") + text
            transcription_text_ref[0] = committed

        try:
            if not _is_ws_connected(websocket, is_connected_ref):
                return
            if is_final and _spk_enabled:
                _track_task(task_set, _send_final_with_speaker(text))
            else:
                _track_task(task_set, _send_result(text, is_final))
        except Exception as e:
            logger.warning(f"Failed to schedule sending TranscriptionResultChanged: {e}")

    return on_result


def _create_error_callback(
    *, websocket: WebSocket, logger, is_connected_ref: list[bool], task_set: set[asyncio.Task]
):
    async def _send_error(error: Exception) -> None:
        try:
            if (
                is_connected_ref[0]
                and websocket.application_state == WebSocketState.CONNECTED
                and websocket.client_state == WebSocketState.CONNECTED
            ):
                await websocket.send_json(
                    {"header": {"name": "TaskFailed"}, "payload": {"error": str(error)}}
                )
        except Exception as e:
            is_connected_ref[0] = False
            logger.warning(f"Failed to send TaskFailed to client: {e}")

    def on_error(error: Exception) -> None:
        logger.error(f"ASR转录错误: {error}")
        if is_connected_ref[0]:
            try:
                if (
                    websocket.application_state == WebSocketState.CONNECTED
                    and websocket.client_state == WebSocketState.CONNECTED
                ):
                    _track_task(task_set, _send_error(error))
            except Exception as e:
                logger.warning(f"Failed to schedule sending TaskFailed: {e}")

    return on_error



def _handle_websocket_text_message(
    message: dict,
    logger,
    segment_timestamps_ref: list[list[float] | None],
    should_segment_ref: list[bool] | None = None,
) -> bool:
    """处理 WebSocket 文本消息，返回是否应该停止流。

    Returns:
        True 如果应该停止流，False 如果继续
    """
    msg_type = message.get("type")
    if msg_type == "stop":
        segment_timestamps_from_frontend = message.get("segment_timestamps", [])
        if isinstance(segment_timestamps_from_frontend, list):
            segment_timestamps_ref[0] = segment_timestamps_from_frontend
            logger.info(
                f"Received stop signal from client with {len(segment_timestamps_from_frontend)} segment timestamps"
            )
        else:
            logger.info("Received stop signal from client")
        return True
    if msg_type == "segment" and should_segment_ref:
        # 客户端请求分段（用于手动分段或同步）
        should_segment_ref[0] = True
        logger.info("Received segment request from client")
    return False


async def _audio_stream_generator(  # noqa: C901
    websocket: WebSocket,
    logger,
    audio_chunks: list[bytes],
    segment_timestamps_ref: list[list[float] | None],
    should_segment_ref: list[bool] | None = None,
    speaker_diarizer=None,
):
    """Yield audio bytes from websocket until stop signal.

    Args:
        segment_timestamps_ref: 用于存储从客户端接收的时间戳数组的引用
        should_segment_ref: 用于标记是否需要分段（外部可以设置此标志来触发分段）
    """
    chunk_count = 0
    chunk_bytes_total = 0
    loop_started_at = get_utc_now()

    while True:
        try:
            data = await websocket.receive()
            if data.get("type") == "websocket.disconnect":
                logger.info("WebSocket disconnected in audio stream generator")
                break
            if "bytes" in data:
                chunk = data["bytes"]
                if chunk:
                    chunk_count += 1
                    chunk_bytes_total += len(chunk)
                    audio_chunks.append(chunk)
                    if speaker_diarizer is not None:
                        speaker_diarizer.feed_audio(chunk)
                    # 实时转写链路：对发送给 ASR 的音频做 AGC（不改动原始落盘数据）
                    yield _apply_agc_to_pcm(logger, chunk, log_stats=False, warn_silence=False)
                continue
            if "text" in data:
                try:
                    message = json.loads(data["text"])
                    should_stop = _handle_websocket_text_message(
                        message, logger, segment_timestamps_ref, should_segment_ref
                    )
                    if should_stop:
                        break
                except json.JSONDecodeError:
                    logger.debug(f"Ignoring non-JSON text message: {data.get('text', '')[:50]}")
                continue
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected in audio stream generator")
            break
        except Exception as e:
            logger.error(f"Error in audio stream generator: {e}")
            break

    elapsed = max((get_utc_now() - loop_started_at).total_seconds(), 0.001)
    pcm_seconds = chunk_bytes_total / (SAMPLE_RATE * 2)
    capture_ratio = pcm_seconds / elapsed
    logger.info(
        "Audio stream summary: "
        f"chunks={chunk_count}, bytes={chunk_bytes_total}, "
        f"pcm={pcm_seconds:.2f}s, wall={elapsed:.2f}s, ratio={capture_ratio:.3f}"
    )


def _parse_init_message(logger, init_message: dict[str, Any]) -> bool:
    logger.info(f"Received init message: {init_message}")
    return bool(init_message.get("is_24x7", False))


def _apply_agc_to_pcm(
    logger,
    pcm_bytes: bytes,
    *,
    log_stats: bool = True,
    warn_silence: bool = True,
) -> bytes:
    return apply_agc_to_pcm(
        logger,
        pcm_bytes,
        log_stats=log_stats,
        warn_silence=warn_silence,
        silence_max_abs=PCM_SILENCE_MAX_ABS,
        silence_rms=PCM_SILENCE_RMS,
        max_gain=MAX_AGC_GAIN,
        apply_threshold_gain=AGC_APPLY_THRESHOLD_GAIN,
        target_peak_ratio=AGC_TARGET_PEAK_RATIO,
    )


def _detect_silence(
    pcm_bytes: bytes,
    threshold_max_abs: int = PCM_SILENCE_MAX_ABS,
    threshold_rms: float = PCM_SILENCE_RMS,
) -> bool:
    """检测音频是否为静音

    Args:
        pcm_bytes: PCM音频数据
        threshold_max_abs: 最大振幅阈值
        threshold_rms: RMS阈值

    Returns:
        True if silent, False otherwise
    """
    try:
        samples = array.array("h")
        samples.frombytes(pcm_bytes)
        if not samples:
            return True

        max_abs = max(abs(s) for s in samples)
        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
        return max_abs < threshold_max_abs and rms < threshold_rms
    except Exception:
        return False


def _persist_recording(
    *,
    logger,
    audio_service,
    audio_chunks: list[bytes],
    recording_started_at: datetime,
    is_24x7: bool,
) -> tuple[int | None, float | None]:
    if not audio_chunks:
        return None, None

    pcm_bytes = b"".join(audio_chunks)
    duration_pcm = len(pcm_bytes) / (SAMPLE_RATE * 2)  # 16-bit mono
    duration_wall = (get_utc_now() - recording_started_at).total_seconds()
    if (
        duration_wall > 0
        and (duration_pcm / duration_wall) < DURATION_PCM_WALL_RATIO_WARN_THRESHOLD
    ):
        logger.warning(
            f"录音时长异常：PCM={duration_pcm:.2f}s < wall={duration_wall:.2f}s，"
            "可能前端音频回调/发送被挂起导致严重丢帧"
        )

    pcm_bytes = _apply_agc_to_pcm(logger, pcm_bytes)
    wav_bytes = _pcm16le_to_wav(pcm_bytes)

    file_path = audio_service.generate_audio_file_path(recording_started_at)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(wav_bytes)

    recording_id = audio_service.create_recording(
        file_path=str(file_path),
        file_size=len(wav_bytes),
        duration=duration_pcm,
        is_24x7=is_24x7,
    )
    audio_service.complete_recording(recording_id)
    return recording_id, duration_pcm


async def _save_transcription_if_any(
    *,
    audio_service,
    recording_id: int | None,
    text: str,
    segment_timestamps: list[float] | None = None,
) -> None:
    if not recording_id or not text:
        return
    await audio_service.save_transcription(
        recording_id=recording_id,
        original_text=text,
        segment_timestamps=segment_timestamps,
    )


# 导入分段相关功能（延迟导入以避免循环依赖）
def _get_segment_functions():
    """延迟导入分段函数以避免循环依赖"""
    segment_module = importlib.import_module("routers.audio_ws_segment")
    return segment_module._save_current_segment, segment_module._segment_monitor_task


# 导入 WebSocket 处理函数（延迟导入以避免循环依赖）
def _get_transcribe_handler():
    """延迟导入 WebSocket 处理函数以避免循环依赖"""
    handler_module = importlib.import_module("routers.audio_ws_handler")
    return handler_module._handle_transcribe_ws


def register_audio_ws_routes(*, router: APIRouter, logger, asr_client, audio_service) -> None:
    """Register websocket endpoints onto the given router."""

    @router.websocket("/transcribe")
    async def websocket_transcribe(websocket: WebSocket) -> None:
        _handle_transcribe_ws = _get_transcribe_handler()
        await _handle_transcribe_ws(
            websocket=websocket, logger=logger, asr_client=asr_client, audio_service=audio_service
        )
