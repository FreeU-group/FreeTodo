"""事件相关路由"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.event import EventDetailResponse, EventListResponse, EventResponse
from lifetrace.schemas.screenshot import ScreenshotResponse

router = APIRouter(prefix="/api/events", tags=["event"])


@router.get("", response_model=EventListResponse)
async def list_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    app_name: str | None = Query(None),
):
    """获取事件列表（事件=前台应用使用阶段），用于事件级别展示与检索，同时返回总数"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None

        logging.info(
            f"获取事件列表 - 参数: limit={limit}, offset={offset}, start_date={start_dt}, end_date={end_dt}, app_name={app_name}"
        )

        # 并行获取事件列表和总数
        events = deps.db_manager.list_events(
            limit=limit,
            offset=offset,
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
        )
        total_count = deps.db_manager.count_events(
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
        )

        logging.info(f"获取事件列表 - 结果: events_count={len(events)}, total_count={total_count}")

        event_responses = [EventResponse(**e) for e in events]
        result = EventListResponse(
            events=event_responses,
            total_count=total_count,
        )

        logging.info(f"返回数据: events数量={len(result.events)}, total_count={result.total_count}")

        return result
    except Exception as e:
        logging.error(f"获取事件列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/count")
async def count_events(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    app_name: str | None = Query(None),
):
    """获取事件总数"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        count = deps.db_manager.count_events(
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
        )
        return {"count": count}
    except Exception as e:
        logging.error(f"获取事件总数失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event_detail(event_id: int):
    """获取事件详情（包含该事件下的截图列表）"""
    try:
        # 读取事件摘要
        event_summary = deps.db_manager.get_event_summary(event_id)
        if not event_summary:
            raise HTTPException(status_code=404, detail="事件不存在")

        # 读取截图
        screenshots = deps.db_manager.get_event_screenshots(event_id)
        screenshots_resp = [
            ScreenshotResponse(
                id=s["id"],
                file_path=s["file_path"],
                app_name=s["app_name"],
                window_title=s["window_title"],
                created_at=s["created_at"],
                text_content=None,
                width=s["width"],
                height=s["height"],
            )
            for s in screenshots
        ]

        return EventDetailResponse(
            id=event_summary["id"],
            app_name=event_summary["app_name"],
            window_title=event_summary["window_title"],
            start_time=event_summary["start_time"],
            end_time=event_summary["end_time"],
            screenshots=screenshots_resp,
            ai_title=event_summary.get("ai_title"),
            ai_summary=event_summary.get("ai_summary"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"获取事件详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{event_id}/context")
async def get_event_context(event_id: int):
    """获取事件的OCR文本上下文"""
    try:
        # 获取事件信息
        event_summary = deps.db_manager.get_event_summary(event_id)
        if not event_summary:
            raise HTTPException(status_code=404, detail="事件不存在")

        # 获取事件下所有截图
        screenshots = deps.db_manager.get_event_screenshots(event_id)

        # 聚合OCR文本
        ocr_texts = []
        for screenshot in screenshots:
            ocr_results = deps.db_manager.get_ocr_results_by_screenshot(screenshot["id"])
            if ocr_results:
                # 取第一个OCR结果的文本内容（通常一个截图只有一个OCR结果）
                for ocr in ocr_results:
                    if ocr.get("text_content"):
                        ocr_texts.append(ocr["text_content"])
                        break  # 只取第一个有内容的结果

        return {
            "event_id": event_id,
            "app_name": event_summary.get("app_name"),
            "window_title": event_summary.get("window_title"),
            "start_time": event_summary.get("start_time"),
            "end_time": event_summary.get("end_time"),
            "ocr_texts": ocr_texts,
            "screenshot_count": len(screenshots),
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"获取事件上下文失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/{event_id}/generate-summary")
async def generate_event_summary(event_id: int):
    """手动触发单个事件的摘要生成"""
    try:
        from lifetrace.llm.event_summary_service import event_summary_service

        # 检查事件是否存在
        event_info = deps.db_manager.get_event_summary(event_id)
        if not event_info:
            raise HTTPException(status_code=404, detail="事件不存在")

        # 生成摘要
        success = event_summary_service.generate_event_summary(event_id)

        if success:
            # 获取更新后的事件信息
            updated_event = deps.db_manager.get_event_summary(event_id)
            return {
                "success": True,
                "event_id": event_id,
                "ai_title": updated_event.get("ai_title"),
                "ai_summary": updated_event.get("ai_summary"),
            }
        else:
            raise HTTPException(status_code=500, detail="摘要生成失败")

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"生成事件摘要失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
