"""活动相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from lifetrace.llm.activity_summary_service import activity_summary_service
from lifetrace.schemas.activity import (
    ActivityEventsResponse,
    ActivityListResponse,
    ActivityResponse,
    ManualActivityCreateRequest,
    ManualActivityCreateResponse,
)
from lifetrace.storage import activity_mgr, event_mgr
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


def _validate_event_ids(event_ids: list[int]) -> None:
    """验证事件ID列表不为空"""
    if not event_ids:
        raise HTTPException(status_code=400, detail="事件ID列表不能为空")


def _get_and_validate_events(event_ids: list[int]) -> list[dict]:
    """批量查询事件详情并验证它们存在"""
    events = event_mgr.get_events_by_ids(event_ids)
    if not events:
        raise HTTPException(status_code=404, detail="未找到任何事件")

    found_event_ids = {e["id"] for e in events}
    missing_event_ids = set(event_ids) - found_event_ids
    if missing_event_ids:
        raise HTTPException(status_code=404, detail=f"以下事件不存在: {sorted(missing_event_ids)}")

    return events


def _validate_events_ended(events: list[dict]) -> None:
    """验证所有事件都已结束（有end_time）"""
    unended_events = [e for e in events if not e.get("end_time")]
    if unended_events:
        unended_ids = [e["id"] for e in unended_events]
        raise HTTPException(
            status_code=400,
            detail=f"以下事件尚未结束，无法聚合: {sorted(unended_ids)}",
        )


def _validate_events_not_linked(events: list[dict]) -> None:
    """检查是否有事件已关联到其他活动"""
    already_linked_events = []
    for event in events:
        if activity_mgr.activity_exists_for_event_id(event["id"]):
            already_linked_events.append(event["id"])

    if already_linked_events:
        raise HTTPException(
            status_code=400,
            detail=f"以下事件已关联到其他活动: {sorted(already_linked_events)}",
        )


def _calculate_activity_time_range(events: list[dict]) -> tuple[datetime, datetime]:
    """计算活动时间范围"""
    start_times = [e["start_time"] for e in events if e.get("start_time")]
    end_times = [e["end_time"] for e in events if e.get("end_time")]

    if not start_times or not end_times:
        raise HTTPException(status_code=400, detail="无法计算活动时间范围")

    return min(start_times), max(end_times)


def _prepare_events_data(events: list[dict]) -> list[dict]:
    """准备事件数据用于生成摘要"""
    return [
        {
            "ai_title": event.get("ai_title") or "",
            "ai_summary": event.get("ai_summary") or "",
            "start_time": event.get("start_time"),
        }
        for event in events
    ]


def _create_activity_with_summary(
    events_data: list[dict],
    activity_start_time: datetime,
    activity_end_time: datetime,
    event_ids: list[int],
) -> dict:
    """生成活动摘要并创建活动"""
    result = activity_summary_service.generate_activity_summary(
        events=events_data,
        start_time=activity_start_time,
        end_time=activity_end_time,
    )

    if not result:
        raise HTTPException(status_code=500, detail="生成活动摘要失败")

    activity_id = activity_mgr.create_activity(
        start_time=activity_start_time,
        end_time=activity_end_time,
        ai_title=result["title"],
        ai_summary=result["summary"],
        event_ids=event_ids,
    )

    if not activity_id:
        raise HTTPException(status_code=500, detail="创建活动失败")

    created_activity = activity_mgr.get_activity(activity_id)
    if not created_activity:
        raise HTTPException(status_code=500, detail="获取创建的活动信息失败")

    logger.info(f"成功手动创建活动 {activity_id}: {result['title']}，包含 {len(event_ids)} 个事件")

    return created_activity


@router.post("/manual", response_model=ManualActivityCreateResponse, status_code=201)
async def create_activity_manual(request: ManualActivityCreateRequest):
    """手动聚合指定事件集合为活动

    Args:
        request: 包含事件ID列表的请求

    Returns:
        创建的活动信息
    """
    try:
        _validate_event_ids(request.event_ids)
        logger.info(f"手动聚合活动 - 事件ID列表: {request.event_ids}")

        events = _get_and_validate_events(request.event_ids)
        _validate_events_ended(events)
        _validate_events_not_linked(events)

        activity_start_time, activity_end_time = _calculate_activity_time_range(events)
        events_data = _prepare_events_data(events)

        created_activity = _create_activity_with_summary(
            events_data, activity_start_time, activity_end_time, request.event_ids
        )

        return ManualActivityCreateResponse(**created_activity)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"手动聚合活动失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"手动聚合活动失败: {str(e)}") from e
