"""搜索相关路由"""

from fastapi import APIRouter, HTTPException

from lifetrace.schemas.event import EventResponse
from lifetrace.schemas.screenshot import ScreenshotResponse
from lifetrace.schemas.search import SearchRequest
from lifetrace.storage import event_mgr, screenshot_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[ScreenshotResponse])
async def search_screenshots(search_request: SearchRequest):
    """搜索截图"""
    try:
        results = screenshot_mgr.search_screenshots(
            query=search_request.query,
            start_date=search_request.start_date,
            end_date=search_request.end_date,
            app_name=search_request.app_name,
            limit=search_request.limit,
        )

        return [ScreenshotResponse(**result) for result in results]

    except Exception as e:
        logger.error(f"搜索截图失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/event-search", response_model=list[EventResponse])
async def search_events(search_request: SearchRequest):
    """事件级简单文本搜索：按OCR分组后返回事件摘要"""
    try:
        results = event_mgr.search_events_simple(
            query=search_request.query,
            start_date=search_request.start_date,
            end_date=search_request.end_date,
            app_name=search_request.app_name,
            limit=search_request.limit,
        )
        return [EventResponse(**r) for r in results]
    except Exception as e:
        logger.error(f"搜索事件失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
