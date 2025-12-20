"""活动相关路由"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from lifetrace.core.dependencies import get_activity_service
from lifetrace.schemas.activity import (
    ActivityEventsResponse,
    ActivityListResponse,
    ManualActivityCreateRequest,
    ManualActivityCreateResponse,
)
from lifetrace.services.activity_service import ActivityService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/activities", tags=["activity"])


@router.get("", response_model=ActivityListResponse)
async def list_activities(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    service: ActivityService = Depends(get_activity_service),
):
    """获取活动列表（活动=聚合的事件窗口）"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None

        return service.list_activities(
            limit=limit,
            offset=offset,
            start_date=start_dt,
            end_date=end_dt,
        )
    except Exception as e:
        logger.error(f"获取活动列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{activity_id}/events", response_model=ActivityEventsResponse)
async def get_activity_events(
    activity_id: int,
    service: ActivityService = Depends(get_activity_service),
):
    """获取指定活动关联的事件ID列表"""
    try:
        return service.get_activity_events(activity_id)
    except Exception as e:
        logger.error(f"获取活动 {activity_id} 的事件列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/manual", response_model=ManualActivityCreateResponse, status_code=201)
async def create_activity_manual(
    request: ManualActivityCreateRequest,
    service: ActivityService = Depends(get_activity_service),
):
    """手动聚合指定事件集合为活动

    Args:
        request: 包含事件ID列表的请求

    Returns:
        创建的活动信息
    """
    try:
        return service.create_activity_manual(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"手动聚合活动失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"手动聚合活动失败: {str(e)}") from e
