"""Audio websocket handler logic.

Split from `audio_ws.py` to reduce file size and complexity.
"""

from __future__ import annotations

import asyncio
import contextlib
import importlib
import json

from fastapi import WebSocket, WebSocketDisconnect

from util.time_utils import get_utc_now


def _track_handler_task(task_set: set[asyncio.Task], coro) -> None:
    task = asyncio.create_task(coro)
    task_set.add(task)
    task.add_done_callback(task_set.discard)


async def _publish_perception_audio_sentence(
    *, text: str, logger, ws_source: str = "mic_pc", ws_node_id: str = "local"
) -> None:
    try:
        from perception.manager import try_get_perception_manager  # noqa: PLC0415
        from perception.models import SourceType  # noqa: PLC0415

        mgr = try_get_perception_manager()
        if mgr is None:
            return
        try:
            source_type = SourceType(ws_source)
        except ValueError:
            source_type = None
        await mgr.try_publish_audio_transcription(
            text,
            metadata={"source": "audio_ws", "node_id": ws_node_id},
            source=source_type,
        )
    except Exception as exc:
        logger.debug(f"Perception publish skipped: {exc}")


async def _handle_json_error(websocket: WebSocket, logger, e: json.JSONDecodeError) -> None:
    """处理 JSON 解析错误"""
    logger.error(f"Failed to parse WebSocket message: {e}")
    with contextlib.suppress(Exception):
        await websocket.close(code=1003, reason="Invalid message format")


async def _handle_websocket_error(websocket: WebSocket, logger, e: Exception) -> None:
    """处理 WebSocket 错误"""
    logger.error(f"WebSocket error: {e}", exc_info=True)
    with contextlib.suppress(Exception):
        await websocket.close(code=1011, reason=str(e))


class _RunTranscriptionStreamContext:
    """运行转录流的上下文，用于减少参数数量"""

    def __init__(self, **kwargs):
        self.asr_client = kwargs["asr_client"]
        self.websocket = kwargs["websocket"]
        self.logger = kwargs["logger"]
        self.audio_chunks = kwargs["audio_chunks"]
        self.segment_timestamps_ref = kwargs["segment_timestamps_ref"]
        self.should_segment_ref = kwargs["should_segment_ref"]
        self.on_result = kwargs["on_result"]
        self.on_error = kwargs["on_error"]
        self.speaker_diarizer = kwargs.get("speaker_diarizer")


async def _run_transcription_stream(*, ctx: _RunTranscriptionStreamContext) -> None:
    """运行 ASR 转录流"""
    audio_ws_module = importlib.import_module("routers.audio_ws")
    audio_stream = audio_ws_module._audio_stream_generator(
        websocket=ctx.websocket,
        logger=ctx.logger,
        audio_chunks=ctx.audio_chunks,
        segment_timestamps_ref=ctx.segment_timestamps_ref,
        should_segment_ref=ctx.should_segment_ref,
        speaker_diarizer=ctx.speaker_diarizer,
    )
    await ctx.asr_client.transcribe_stream(
        audio_stream=audio_stream,
        on_result=ctx.on_result,
        on_error=ctx.on_error,
    )


def _get_audio_ws_functions():
    """延迟导入 audio_ws 模块的函数"""
    audio_ws_module = importlib.import_module("routers.audio_ws")
    return {
        "_audio_stream_generator": audio_ws_module._audio_stream_generator,
        "_create_error_callback": audio_ws_module._create_error_callback,
        "_create_result_callback": audio_ws_module._create_result_callback,
        "_get_segment_functions": audio_ws_module._get_segment_functions,
        "_handle_json_error": _handle_json_error,
        "_handle_websocket_error": _handle_websocket_error,
        "_parse_init_message": audio_ws_module._parse_init_message,
        "_persist_recording": audio_ws_module._persist_recording,
        "_run_transcription_stream": _run_transcription_stream,
        "_save_transcription_if_any": audio_ws_module._save_transcription_if_any,
    }


class _SaveFinalDataContext:
    """保存最终数据的上下文，用于减少参数数量"""

    def __init__(self, **kwargs):
        self.data_saved_ref = kwargs["data_saved_ref"]
        self.stop_segment_task_func = kwargs["stop_segment_task_func"]
        self.audio_chunks = kwargs["audio_chunks"]
        self.transcription_text_ref = kwargs["transcription_text_ref"]
        self.segment_timestamps_ref = kwargs["segment_timestamps_ref"]
        self.recording_started_at = kwargs["recording_started_at"]
        self.is_24x7_ref = kwargs["is_24x7_ref"]
        self.audio_service = kwargs["audio_service"]
        self.logger = kwargs["logger"]
        self._persist_recording = kwargs["_persist_recording"]
        self._save_transcription_if_any = kwargs["_save_transcription_if_any"]


async def _save_final_data_internal(*, ctx: _SaveFinalDataContext) -> None:
    """保存最终数据（确保只执行一次）"""
    if ctx.data_saved_ref[0]:
        return
    ctx.data_saved_ref[0] = True

    try:
        await ctx.stop_segment_task_func()

        # 检查是否有数据需要保存
        if not ctx.audio_chunks and not ctx.transcription_text_ref[0]:
            ctx.logger.info("无数据需要保存")
            return

        ctx.logger.info(
            f"保存最终数据: audio_chunks={len(ctx.audio_chunks)}, text_len={len(ctx.transcription_text_ref[0])}"
        )

        # 保存最后一段
        recording_id, _duration = ctx._persist_recording(
            logger=ctx.logger,
            audio_service=ctx.audio_service,
            audio_chunks=ctx.audio_chunks,
            recording_started_at=ctx.recording_started_at,
            is_24x7=ctx.is_24x7_ref[0],
        )
        await ctx._save_transcription_if_any(
            audio_service=ctx.audio_service,
            recording_id=recording_id,
            text=ctx.transcription_text_ref[0],
            segment_timestamps=ctx.segment_timestamps_ref[0],
        )

        if recording_id:
            ctx.logger.info(
                f"✅ 数据保存成功: recording_id={recording_id}, duration={_duration:.2f}s"
            )
        else:
            ctx.logger.warning("数据保存完成，但没有生成 recording_id（可能音频为空）")
    except Exception as e:
        ctx.logger.error(f"❌ 保存最终数据失败: {e}", exc_info=True)


async def _initialize_handlers_internal(
    *,
    websocket: WebSocket,
    logger,
    state: dict,
    funcs: dict,
    on_final_sentence,
) -> tuple:
    """初始化处理函数和回调"""
    init_message = await websocket.receive_json()
    is_24x7 = funcs["_parse_init_message"](logger, init_message)
    state["is_24x7_ref"][0] = is_24x7

    on_result_base = funcs["_create_result_callback"](
        websocket=websocket,
        logger=logger,
        transcription_text_ref=state["transcription_text_ref"],
        is_connected_ref=state["is_connected_ref"],
        task_set=state["task_set"],
        speaker_diarizer=state.get("speaker_diarizer"),
        speaker_segments_ref=state.get("speaker_segments_ref"),
    )

    def on_result(text: str, is_final: bool) -> None:
        on_result_base(text, is_final)
        if is_final:
            on_final_sentence(text)

    on_error = funcs["_create_error_callback"](
        websocket=websocket,
        logger=logger,
        is_connected_ref=state["is_connected_ref"],
        task_set=state["task_set"],
    )

    return on_result, on_error, is_24x7


class _StartSegmentMonitorContext:
    """启动分段监控的上下文，用于减少参数数量"""

    def __init__(self, **kwargs):
        self.is_24x7 = kwargs["is_24x7"]
        self.logger = kwargs["logger"]
        self.audio_service = kwargs["audio_service"]
        self.recording_started_at = kwargs["recording_started_at"]
        self.audio_chunks = kwargs["audio_chunks"]
        self.transcription_text_ref = kwargs["transcription_text_ref"]
        self.segment_timestamps_ref = kwargs["segment_timestamps_ref"]
        self.should_segment_ref = kwargs["should_segment_ref"]
        self.is_connected_ref = kwargs["is_connected_ref"]
        self.websocket = kwargs["websocket"]
        self.speaker_diarizer = kwargs.get("speaker_diarizer")
        self._get_segment_functions = kwargs["_get_segment_functions"]


async def _start_segment_monitor_internal(
    *, ctx: _StartSegmentMonitorContext
) -> asyncio.Task | None:
    """启动分段监控任务"""
    _save_current_segment, _segment_monitor_task = ctx._get_segment_functions()
    return asyncio.create_task(
        _segment_monitor_task(
            params={
                "logger": ctx.logger,
                "audio_service": ctx.audio_service,
                "recording_started_at": ctx.recording_started_at,
                "audio_chunks": ctx.audio_chunks,
                "transcription_text_ref": ctx.transcription_text_ref,
                "segment_timestamps_ref": ctx.segment_timestamps_ref,
                "should_segment_ref": ctx.should_segment_ref,
                "is_connected_ref": ctx.is_connected_ref,
                "websocket": ctx.websocket,
                "speaker_diarizer": ctx.speaker_diarizer,
            },
            is_24x7=ctx.is_24x7,
        )
    )


def _setup_websocket_state():
    """初始化 WebSocket 状态变量"""
    recording_started_at = get_utc_now()
    transcription_text_ref: list[str] = [""]
    audio_chunks: list[bytes] = []
    is_connected_ref: list[bool] = [True]
    segment_timestamps_ref: list[list[float] | None] = [None]
    should_segment_ref: list[bool] = [False]
    is_24x7_ref: list[bool] = [False]
    data_saved_ref: list[bool] = [False]
    task_set: set[asyncio.Task] = set()
    speaker_segments_ref: list[list] = [[]]

    speaker_diarizer = None
    with contextlib.suppress(Exception):
        from services.diart_diarizer import DiartDiarizer  # noqa: PLC0415

        diarizer = DiartDiarizer()
        diarizer.start()
        if diarizer.enabled:
            speaker_diarizer = diarizer

    return {
        "recording_started_at": recording_started_at,
        "transcription_text_ref": transcription_text_ref,
        "audio_chunks": audio_chunks,
        "is_connected_ref": is_connected_ref,
        "segment_timestamps_ref": segment_timestamps_ref,
        "should_segment_ref": should_segment_ref,
        "is_24x7_ref": is_24x7_ref,
        "data_saved_ref": data_saved_ref,
        "task_set": task_set,
        "speaker_diarizer": speaker_diarizer,
        "speaker_segments_ref": speaker_segments_ref,
    }


async def _run_transcription_with_handlers(
    *,
    asr_client,
    websocket: WebSocket,
    logger,
    state: dict,
    on_result,
    on_error,
    _run_transcription_stream,
):
    """运行转录流处理"""
    ctx = _RunTranscriptionStreamContext(
        asr_client=asr_client,
        websocket=websocket,
        logger=logger,
        audio_chunks=state["audio_chunks"],
        segment_timestamps_ref=state["segment_timestamps_ref"],
        should_segment_ref=state["should_segment_ref"],
        on_result=on_result,
        on_error=on_error,
        speaker_diarizer=state.get("speaker_diarizer"),
    )
    await _run_transcription_stream(ctx=ctx)


async def _setup_websocket_connection(*, websocket: WebSocket, logger) -> dict:
    """设置 WebSocket 连接并初始化状态"""
    await websocket.accept()
    logger.info(
        f"WebSocket client connected: application_state={websocket.application_state}, client_state={websocket.client_state}"
    )
    return _setup_websocket_state()


async def _create_handlers_and_monitor(
    *,
    websocket: WebSocket,
    logger,
    audio_service,
    state: dict,
    funcs: dict,
    on_final_sentence,
) -> tuple:
    """创建处理函数并启动监控任务"""
    on_result, on_error, is_24x7 = await _initialize_handlers_internal(
        websocket=websocket,
        logger=logger,
        state=state,
        funcs=funcs,
        on_final_sentence=on_final_sentence,
    )
    segment_ctx = _StartSegmentMonitorContext(
        is_24x7=is_24x7,
        logger=logger,
        audio_service=audio_service,
        recording_started_at=state["recording_started_at"],
        audio_chunks=state["audio_chunks"],
        transcription_text_ref=state["transcription_text_ref"],
        segment_timestamps_ref=state["segment_timestamps_ref"],
        should_segment_ref=state["should_segment_ref"],
        is_connected_ref=state["is_connected_ref"],
        websocket=websocket,
        speaker_diarizer=state.get("speaker_diarizer"),
        _get_segment_functions=funcs["_get_segment_functions"],
    )
    segment_task = await _start_segment_monitor_internal(ctx=segment_ctx)
    return on_result, on_error, segment_task


async def _run_main_transcription_flow(
    *,
    asr_client,
    websocket: WebSocket,
    logger,
    state: dict,
    funcs: dict,
    on_final_sentence,
    _run_transcription_stream,
    audio_service,
) -> tuple:
    """运行主要的转录流程"""
    on_result, on_error, segment_task = await _create_handlers_and_monitor(
        websocket=websocket,
        logger=logger,
        audio_service=audio_service,
        state=state,
        funcs=funcs,
        on_final_sentence=on_final_sentence,
    )

    await _run_transcription_with_handlers(
        asr_client=asr_client,
        websocket=websocket,
        logger=logger,
        state=state,
        on_result=on_result,
        on_error=on_error,
        _run_transcription_stream=_run_transcription_stream,
    )

    return on_result, on_error, segment_task


async def _handle_websocket_errors(
    *,
    websocket: WebSocket,
    logger,
    e: Exception,
    _handle_json_error,
    _handle_websocket_error,
) -> None:
    """处理 WebSocket 错误"""
    if isinstance(e, WebSocketDisconnect):
        logger.info("WebSocket client disconnected，正在保存数据...")
    elif isinstance(e, json.JSONDecodeError):
        await _handle_json_error(websocket, logger, e)
    elif isinstance(e, asyncio.CancelledError):
        logger.warning("WebSocket handler 被取消，正在保存数据...")
    elif isinstance(e, KeyboardInterrupt):
        logger.warning("收到 KeyboardInterrupt，正在保存数据...")
    else:
        await _handle_websocket_error(websocket, logger, e)


async def _create_save_final_data_func(
    *,
    state: dict,
    stop_segment_task_func,
    audio_service,
    logger,
    _persist_recording,
    _save_transcription_if_any,
):
    """创建保存最终数据的函数"""

    async def save_final_data():
        """保存最终数据（确保只执行一次）"""
        ctx = _SaveFinalDataContext(
            data_saved_ref=state["data_saved_ref"],
            stop_segment_task_func=stop_segment_task_func,
            audio_chunks=state["audio_chunks"],
            transcription_text_ref=state["transcription_text_ref"],
            segment_timestamps_ref=state["segment_timestamps_ref"],
            recording_started_at=state["recording_started_at"],
            is_24x7_ref=state["is_24x7_ref"],
            audio_service=audio_service,
            logger=logger,
            _persist_recording=_persist_recording,
            _save_transcription_if_any=_save_transcription_if_any,
        )
        await _save_final_data_internal(ctx=ctx)

    return save_final_data


async def _cleanup_websocket(*, state: dict, save_final_data, logger, websocket: WebSocket) -> None:
    """清理 WebSocket 连接"""
    state["is_connected_ref"][0] = False

    if (diarizer := state.get("speaker_diarizer")) is not None and hasattr(diarizer, "stop"):
        diarizer.stop()

    try:
        await save_final_data()
    except Exception as e:
        logger.error(f"finally 中保存数据失败: {e}", exc_info=True)

    logger.info(
        f"WebSocket handler finished: application_state={websocket.application_state}, client_state={websocket.client_state}"
    )


async def _handle_transcribe_ws(*, websocket: WebSocket, logger, asr_client, audio_service) -> None:
    funcs = _get_audio_ws_functions()
    state = await _setup_websocket_connection(websocket=websocket, logger=logger)
    segment_task: asyncio.Task | None = None

    if state.get("speaker_diarizer"):
        logger.info("说话人识别已启用 (Speaker Diarization + Voiceprint Re-ID)")

    ws_source = websocket.query_params.get("source", "mic_pc")
    ws_node_id = websocket.query_params.get("node_id", "local")
    logger.info(f"Audio WS params: source={ws_source}, node_id={ws_node_id}")

    def on_final_sentence(text: str) -> None:
        _track_handler_task(
            state["task_set"],
            _publish_perception_audio_sentence(
                text=text, logger=logger, ws_source=ws_source, ws_node_id=ws_node_id
            ),
        )

    async def stop_segment_task():
        """停止分段监控任务"""
        nonlocal segment_task
        if segment_task and not segment_task.done():
            segment_task.cancel()
            try:
                await segment_task
            except asyncio.CancelledError:
                logger.info("分段监控任务已取消")

    save_final_data = await _create_save_final_data_func(
        state=state,
        stop_segment_task_func=stop_segment_task,
        audio_service=audio_service,
        logger=logger,
        _persist_recording=funcs["_persist_recording"],
        _save_transcription_if_any=funcs["_save_transcription_if_any"],
    )

    try:
        await _run_main_transcription_flow(
            asr_client=asr_client,
            websocket=websocket,
            logger=logger,
            state=state,
            funcs=funcs,
            on_final_sentence=on_final_sentence,
            _run_transcription_stream=funcs["_run_transcription_stream"],
            audio_service=audio_service,
        )
        await save_final_data()
    except Exception as e:
        await _handle_websocket_errors(
            websocket=websocket,
            logger=logger,
            e=e,
            _handle_json_error=funcs["_handle_json_error"],
            _handle_websocket_error=funcs["_handle_websocket_error"],
        )
    finally:
        await _cleanup_websocket(
            state=state,
            save_final_data=save_final_data,
            logger=logger,
            websocket=websocket,
        )
