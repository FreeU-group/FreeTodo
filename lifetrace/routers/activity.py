"""活动相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from lifetrace.schemas.activity import (
    ActivityEventsResponse,
    ActivityListResponse,
    ActivityResponse,
)
from lifetrace.storage import activity_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/activities", tags=["activity"])


@router.get("", response_model=ActivityListResponse)
async def list_activities(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """获取活动列表（活动=聚合的事件窗口）"""
    try:
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None

        logger.info(
            f"获取活动列表 - 参数: limit={limit}, offset={offset}, start_date={start_dt}, end_date={end_dt}"
        )

        activities = activity_mgr.get_activities(
            limit=limit,
            offset=offset,
            start_date=start_dt,
            end_date=end_dt,
        )
        total_count = activity_mgr.count_activities(
            start_date=start_dt,
            end_date=end_dt,
        )

        logger.info(
            f"获取活动列表 - 结果: activities_count={len(activities)}, total_count={total_count}"
        )

        activity_responses = [ActivityResponse(**a) for a in activities]
        return ActivityListResponse(activities=activity_responses, total_count=total_count)
    except Exception as e:
        logger.error(f"获取活动列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{activity_id}/events", response_model=ActivityEventsResponse)
async def get_activity_events(activity_id: int):
    """获取指定活动关联的事件ID列表"""
    try:
        logger.info(f"获取活动 {activity_id} 的事件列表")
        event_ids = activity_mgr.get_activity_events(activity_id)
        return ActivityEventsResponse(event_ids=event_ids)
    except Exception as e:
        logger.error(f"获取活动 {activity_id} 的事件列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
