"""事件相关路由"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from lifetrace.core.dependencies import get_event_service
from lifetrace.schemas.event import EventDetailResponse, EventListResponse
from lifetrace.services.event_service import EventService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/events", tags=["event"])


@router.get("", response_model=EventListResponse)
async def list_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    app_name: str | None = Query(None),
    service: EventService = Depends(get_event_service),
):
    """获取事件列表（事件=前台应用使用阶段），用于事件级别展示与检索，同时返回总数"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None

        return service.list_events(
            limit=limit,
            offset=offset,
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
        )
    except Exception as e:
        logger.error(f"获取事件列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/count")
async def count_events(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    app_name: str | None = Query(None),
    service: EventService = Depends(get_event_service),
):
    """获取事件总数"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        return service.count_events(
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
        )
    except Exception as e:
        logger.error(f"获取事件总数失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event_detail(
    event_id: int,
    service: EventService = Depends(get_event_service),
):
    """获取事件详情（包含该事件下的截图列表）"""
    try:
        return service.get_event_detail(event_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取事件详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{event_id}/context")
async def get_event_context(
    event_id: int,
    service: EventService = Depends(get_event_service),
):
    """获取事件的OCR文本上下文"""
    try:
        return service.get_event_context(event_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取事件上下文失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/{event_id}/generate-summary")
async def generate_event_summary(
    event_id: int,
    service: EventService = Depends(get_event_service),
):
    """手动触发单个事件的摘要生成"""
    try:
        return service.generate_event_summary(event_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成事件摘要失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
