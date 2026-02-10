"""音频录制和转录相关路由"""

import json
import time
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import select

from lifetrace.routers.audio_ws import register_audio_ws_routes
from lifetrace.routers.hardware_audio import register_hardware_audio_routes
from lifetrace.services.asr_client import ASRClient
from lifetrace.services.audio_service import AudioService
from lifetrace.storage import get_session
from lifetrace.storage.models import AudioRecording, Transcription
from lifetrace.storage.sql_utils import col
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio"])

# 全局服务实例
asr_client = ASRClient()
audio_service = AudioService()
register_audio_ws_routes(
    router=router, logger=logger, asr_client=asr_client, audio_service=audio_service
)
register_hardware_audio_routes(router=router, asr_client=asr_client, audio_service=audio_service)


def _to_local(dt: datetime | None) -> datetime | None:
    """将时间转换为本地时区（带偏移），并返回 timezone-aware datetime。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        offset = -time.timezone if time.daylight == 0 else -time.altzone
        local_tz = timezone(timedelta(seconds=offset))
        return dt.replace(tzinfo=local_tz)
    return dt.astimezone()


@router.get("/recordings")
async def get_recordings(date: str | None = Query(None)):
    """获取录音列表"""
    try:
        if date:
            # 处理日期字符串，支持多种格式
            try:
                # 尝试解析ISO格式
                if "T" in date or "Z" in date:
                    target_date = datetime.fromisoformat(date.replace("Z", "+00:00"))
                else:
                    # 处理 YYYY-MM-DD 格式
                    date_obj = date_type.fromisoformat(date)
                    target_date = datetime.combine(date_obj, datetime.min.time())
            except ValueError as e:
                logger.error(f"日期格式错误: {date}, {e}")
                return JSONResponse({"error": f"无效的日期格式: {date}"}, status_code=400)
        else:
            target_date = get_utc_now().astimezone()

        recordings = audio_service.get_recordings_by_date(target_date)

        result = []
        for rec in recordings:
            if not rec:
                continue
            start_time = rec["start_time"]
            result.append(
                {
                    "id": rec["id"],
                    "date": start_time.strftime("%m月%d日 录音"),
                    "time": start_time.strftime("%H:%M"),
                    "duration": f"{int(rec['duration'] // 60)}:{int(rec['duration'] % 60):02d}",
                    "durationSeconds": float(rec["duration"]),
                    "size": f"{rec['file_size'] / 1024:.1f} KB",
                    "isCurrent": rec["status"] == "recording",
                }
            )

        return JSONResponse({"recordings": result})
    except Exception as e:
        logger.error(f"获取录音列表失败: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


def _parse_date_param(date: str | None) -> datetime:
    """解析日期参数"""
    if date:
        try:
            if "T" in date or "Z" in date:
                return datetime.fromisoformat(date.replace("Z", "+00:00"))
            else:
                date_obj = date_type.fromisoformat(date)
                return datetime.combine(date_obj, datetime.min.time())
        except ValueError as e:
            logger.error(f"日期格式错误: {date}, {e}")
            raise ValueError(f"无效的日期格式: {date}") from e
    else:
        return get_utc_now().astimezone()


def _build_timeline_item(
    rec: dict[str, Any], transcription: dict[str, Any] | None, optimized: bool
) -> dict[str, Any]:
    """构建时间线项"""
    text = ""
    segment_timestamps: list[float] | None = None
    if transcription:
        if optimized and transcription.get("optimized_text"):
            text = transcription.get("optimized_text") or ""
        else:
            text = transcription.get("original_text") or ""
        # 解析时间戳（如果存在）
        timestamps_str = transcription.get("segment_timestamps")
        if timestamps_str:
            try:
                segment_timestamps = json.loads(timestamps_str)
                if not isinstance(segment_timestamps, list):
                    segment_timestamps = None
            except (json.JSONDecodeError, TypeError):
                segment_timestamps = None
    start_local = _to_local(rec["start_time"])
    timeline_item: dict[str, Any] = {
        "id": rec["id"],
        "start_time": (start_local or rec["start_time"]).isoformat(),
        "duration": float(rec["duration"]),
        "text": text,
    }
    # 如果有时间戳，添加到返回数据中
    if segment_timestamps:
        timeline_item["segment_timestamps"] = segment_timestamps
    return timeline_item


@router.get("/timeline")
async def get_timeline(date: str | None = Query(None), optimized: bool = Query(False)):
    """按日期返回录音时间线（含转录文本）"""
    try:
        target_date = _parse_date_param(date)
        recordings = audio_service.get_recordings_by_date(target_date)
        timeline: list[dict[str, Any]] = []
        for rec in recordings:
            if not rec:
                continue
            transcription = audio_service.get_transcription(int(rec["id"]))
            timeline_item = _build_timeline_item(rec, transcription, optimized)
            timeline.append(timeline_item)

        return JSONResponse({"timeline": timeline})
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        logger.error(f"获取时间线失败: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.get("/recording/{recording_id}/file")
async def get_recording_file(recording_id: int):
    """获取录音文件（用于前端播放）"""
    try:
        with get_session() as session:
            rec = session.get(AudioRecording, recording_id)
            if not rec or not rec.file_path:
                return JSONResponse({"error": "录音不存在"}, status_code=404)
            file_path = Path(rec.file_path)
            if not file_path.exists():
                logger.error(f"录音文件不存在: {file_path}")
                return JSONResponse({"error": "录音文件不存在或已被删除"}, status_code=404)
            return FileResponse(
                path=str(file_path),
                media_type="audio/wav",
                filename=file_path.name,
            )
    except Exception as e:
        logger.error(f"获取录音文件失败: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


def _load_extracted_json(transcription: dict[str, Any], field: str) -> list[dict[str, Any]]:
    """从转录数据中加载 JSON 字段。

    Args:
        transcription: 转录数据字典
        field: 字段名

    Returns:
        解析后的列表，如果解析失败则返回空列表
    """
    value = transcription.get(field)
    if not value:
        return []
    try:
        return json.loads(value)
    except Exception:
        return []


def _refresh_extracted_from_db(
    transcription_id: int, recording_id: int, optimized: bool
) -> list[dict[str, Any]]:
    """从数据库刷新提取结果（只读取，不清空）。

    Args:
        transcription_id: 转录ID
        recording_id: 录音ID
        optimized: 是否使用优化文本的提取结果

    Returns:
        todos 列表
    """
    _ = transcription_id, optimized
    try:
        # 直接读取数据库，不要调用 update_extraction（会清空数据）
        refreshed = audio_service.get_transcription(recording_id)
        if not refreshed:
            return []

        todos = _load_extracted_json(refreshed, "extracted_todos")
        return todos
    except Exception:
        return []


def _parse_extracted(
    transcription: dict[str, Any],
    optimized: bool = False,
) -> list[dict[str, Any]]:
    """Parse extracted todos and backfill legacy fields.

    Args:
        transcription: 转录数据字典
        optimized: 是否使用优化文本的提取结果

    Returns:
        todos 列表
    """
    todos = _load_extracted_json(transcription, "extracted_todos")

    # Backfill legacy items and persist so clients always get id/dedupe_key/linked
    refreshed_todos = _refresh_extracted_from_db(
        int(transcription["id"]), transcription["audio_recording_id"], optimized
    )
    if refreshed_todos:
        return refreshed_todos

    return todos


@router.get("/transcription/{recording_id}")
async def get_transcription(recording_id: int, optimized: bool = Query(False)):
    """获取转录文本"""
    try:
        transcription = audio_service.get_transcription(recording_id)
        if not transcription:
            return JSONResponse({"error": "转录不存在"}, status_code=404)

        _ = optimized
        text = transcription["original_text"]
        if not text:
            text = ""

        # 根据 optimized 参数选择对应的提取结果
        todos = _parse_extracted(transcription, optimized=optimized)

        return JSONResponse(
            {
                "text": text,
                "recording_id": recording_id,
                "todos": todos,
                "schedules": [],
            }
        )
    except Exception as e:
        logger.error(f"获取转录文本失败: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


class AudioLinkItem(BaseModel):
    kind: str = Field(..., description="todo")
    item_id: str = Field(..., description="extracted item id")
    todo_id: int = Field(..., description="linked todo id")


class AudioLinkRequest(BaseModel):
    links: list[AudioLinkItem]


@router.post("/transcription/{recording_id}/link")
async def link_extracted_items(
    recording_id: int, request: AudioLinkRequest, optimized: bool = Query(False)
):
    """Mark extracted items as linked to todos (persisted in transcription JSON).

    Args:
        recording_id: 录音ID
        request: 链接请求
        optimized: 是否更新优化文本的提取结果
    """
    try:
        result = audio_service.extraction_service.link_extracted_items(
            recording_id=recording_id,
            links=[link.model_dump() for link in request.links],
            optimized=optimized,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"标记提取项已关联失败: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/extract")
async def extract_todos(recording_id: int, optimized: bool = Query(False), force: bool = Query(False)):
    """提取待办事项

    Args:
        recording_id: 录音ID
        optimized: 是否从优化文本提取（False=从原文提取）
        force: 是否强制提取（True=跳过 gate）
    """
    try:
        transcription = audio_service.get_transcription(recording_id)
        if not transcription:
            return JSONResponse({"error": "转录不存在"}, status_code=404)

        _ = optimized
        text = transcription.get("original_text") or ""
        if not text:
            return JSONResponse({"error": "转录文本为空"}, status_code=400)

        segment_timestamps: list[float] | None = None
        if not optimized:
            try:
                ts_raw = transcription.get("segment_timestamps")
                if ts_raw:
                    parsed = json.loads(ts_raw)
                    if isinstance(parsed, list) and parsed and isinstance(parsed[0], (int, float)):
                        segment_timestamps = [float(item) for item in parsed]
            except Exception:
                segment_timestamps = None

        result = await audio_service.extraction_service.extract_todos(
            text,
            force=bool(force),
            segment_timestamps=segment_timestamps,
        )
        compat_result = {**result, "schedules": []}

        # 更新提取结果（根据 optimized 参数更新对应字段）
        with get_session() as session:
            # 查询转录记录（一个 recording_id 只应该有一条）
            trans = session.exec(
                select(Transcription)
                .where(Transcription.audio_recording_id == recording_id)
                .order_by(col(Transcription.id).desc())
            ).first()
            if trans and trans.id is not None:
                audio_service.update_extraction(
                    transcription_id=trans.id,
                    todos=result.get("todos", []),
                    optimized=optimized,
                )

        return JSONResponse(compat_result)
    except Exception as e:
        logger.error(f"提取待办失败: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
