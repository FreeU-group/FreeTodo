"""Audio websocket segment monitoring and saving logic.

Split from `audio_ws.py` to reduce file size and complexity.
"""

from __future__ import annotations

import asyncio
import importlib
from typing import TYPE_CHECKING

from starlette.websockets import WebSocketState

from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from datetime import datetime

# 常量（从 audio_ws 复制以避免循环导入）
SILENCE_CHECK_INTERVAL_SECONDS = 60
SILENCE_DETECTION_THRESHOLD_SECONDS = 600
SEGMENT_DURATION_MINUTES = 30

_segment_tasks: set[asyncio.Task] = set()


def _track_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _segment_tasks.add(task)
    task.add_done_callback(_segment_tasks.discard)
    return task


class _SegmentMonitorContext:
    """分段监控任务的上下文，用于减少参数数量"""

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


class _SegmentSaveContext:
    """分段保存的上下文，用于减少参数数量"""

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
    """通知前端分段已保存"""
    if not ctx.websocket or not ctx.is_connected_ref or not ctx.is_connected_ref[0]:
        return

    try:
        if (
            ctx.websocket.application_state == WebSocketState.CONNECTED
            and ctx.websocket.client_state == WebSocketState.CONNECTED
        ):
            reason_message = ctx.segment_reason or "当前段已保存，开始新段"
            await ctx.websocket.send_json(
                {
                    "header": {"name": "SegmentSaved"},
                    "payload": {
                        "message": reason_message,
                        "segment_start_time": ctx.segment_start_time.isoformat(),
                    },
                }
            )
            ctx.logger.info("已通知前端分段保存")
    except Exception as e:
        ctx.logger.warning(f"通知前端分段保存失败: {e}")


async def _persist_segment_async(
    *,
    logger,
    audio_service,
    audio_chunks: list[bytes],
    transcription_text: str,
    segment_timestamps: list[float] | None,
    segment_start_time: datetime,
) -> None:
    """异步保存分段（不阻塞主流程）"""
    # 延迟导入以避免循环导入
    audio_ws_module = importlib.import_module("routers.audio_ws")
    _persist_recording = audio_ws_module._persist_recording
    _save_transcription_if_any = audio_ws_module._save_transcription_if_any

    try:
        recording_id, _duration = _persist_recording(
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
        logger.info(f"分段保存完成: recording_id={recording_id}, duration={_duration:.2f}s")
    except Exception as e:
        logger.error(f"保存分段失败: {e}", exc_info=True)


async def _save_current_segment(*, params: dict) -> None:
    """保存当前段并清空缓冲区"""
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
        logger.debug("当前段没有音频数据，跳过保存")
        return

    # 保存当前段
    current_chunks = audio_chunks.copy()
    current_text = transcription_text_ref[0]
    current_timestamps = segment_timestamps_ref[0]

    # 清空缓冲区，准备新段
    audio_chunks.clear()
    transcription_text_ref[0] = ""
    segment_timestamps_ref[0] = None

    # 创建上下文
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

    # 通知前端分段已保存
    await _notify_segment_saved(ctx)

    # 异步保存当前段（不阻塞）
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
    """检查30分钟时间分段，返回是否已分段"""
    elapsed = (now - segment_start_time).total_seconds()
    if elapsed >= SEGMENT_DURATION_MINUTES * 60:
        ctx.logger.info("达到30分钟分段时间，保存当前段并开始新段")
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
                "segment_reason": "达到30分钟分段时间，保存当前段并开始新段",
            }
        )
        return True
    return False


async def _check_silence_segment(
    ctx: _SegmentMonitorContext,
    now: datetime,
    segment_start_time: datetime,
    silence_start_time: datetime | None,
) -> tuple[bool, datetime | None]:
    """检查静音分段，返回(是否已分段, 新的静音开始时间)"""
    if len(ctx.audio_chunks) == 0:
        return False, silence_start_time

    # 检查最近一段音频是否为静音
    # 延迟导入以避免循环导入
    audio_ws_module = importlib.import_module("routers.audio_ws")
    _detect_silence = audio_ws_module._detect_silence
    recent_chunks = ctx.audio_chunks[-10:]  # 检查最近10个chunk
    recent_audio = b"".join(recent_chunks)
    is_silent = _detect_silence(recent_audio)

    if is_silent:
        if silence_start_time is None:
            return False, now
        silence_duration = (now - silence_start_time).total_seconds()
        if silence_duration >= SILENCE_DETECTION_THRESHOLD_SECONDS:
            ctx.logger.info(f"检测到长时间静音（{silence_duration:.0f}秒），保存当前段并开始新段")
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
                    "segment_reason": f"检测到长时间静音（{silence_duration:.0f}秒），保存当前段并开始新段",
                }
            )
            return True, None
        return False, silence_start_time
    # 有语音，重置静音计时
    return False, None


async def _check_manual_segment(
    ctx: _SegmentMonitorContext, now: datetime, segment_start_time: datetime
) -> bool:
    """检查外部分段请求，返回是否已分段"""
    _ = now
    if ctx.should_segment_ref[0]:
        ctx.logger.info("收到分段请求，保存当前段并开始新段")
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
                "segment_reason": "收到分段请求，保存当前段并开始新段",
            }
        )
        ctx.should_segment_ref[0] = False
        return True
    return False


async def _segment_monitor_task(*, params: dict, is_24x7: bool) -> None:
    """监控分段条件：30分钟时间分段 + 静音检测"""
    _ = is_24x7
    logger = params["logger"]
    recording_started_at = params["recording_started_at"]

    ctx = _SegmentMonitorContext(**params)
    segment_start_time = recording_started_at
    silence_start_time: datetime | None = None

    while ctx.is_connected_ref[0]:
        try:
            await asyncio.sleep(SILENCE_CHECK_INTERVAL_SECONDS)

            if not ctx.is_connected_ref[0]:
                break

            now = get_utc_now()

            # 检查30分钟时间分段
            if await _check_time_segment(ctx, now, segment_start_time):
                segment_start_time = now
                silence_start_time = None
                ctx.recording_started_at = now
                continue

            # 检查静音（仅在最近有语音的情况下检查）
            was_segmented, silence_start_time = await _check_silence_segment(
                ctx, now, segment_start_time, silence_start_time
            )
            if was_segmented:
                segment_start_time = now
                ctx.recording_started_at = now
                continue

            # 检查外部分段请求
            if await _check_manual_segment(ctx, now, segment_start_time):
                segment_start_time = now
                silence_start_time = None
                ctx.recording_started_at = now

        except asyncio.CancelledError:
            logger.info("分段监控任务已取消")
            break
        except Exception as e:
            logger.error(f"分段监控任务错误: {e}", exc_info=True)
            await asyncio.sleep(5)  # 出错后等待5秒再继续
