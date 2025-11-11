"""搜索相关路由"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.requests import Request

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.event import EventResponse
from lifetrace.schemas.screenshot import ScreenshotResponse
from lifetrace.schemas.search import SearchRequest

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[ScreenshotResponse])
async def search_screenshots(search_request: SearchRequest, request: Request):
    """搜索截图"""
    start_time = datetime.now()

    try:
        # 获取请求信息
        user_agent = request.headers.get("user-agent", "")
        client_ip = request.client.host if request.client else "unknown"

        results = deps.db_manager.search_screenshots(
            query=search_request.query,
            start_date=search_request.start_date,
            end_date=search_request.end_date,
            app_name=search_request.app_name,
            limit=search_request.limit,
        )

        # 计算响应时间
        response_time = (datetime.now() - start_time).total_seconds() * 1000

        # 记录用户行为（如果behavior_tracker可用）
        if deps.behavior_tracker is not None:
            deps.behavior_tracker.track_action(
                action_type="search",
                action_details={
                    "query": search_request.query,
                    "app_name": search_request.app_name,
                    "results_count": len(results),
                    "limit": search_request.limit,
                    "success": True,
                },
                user_agent=user_agent,
                ip_address=client_ip,
                response_time=response_time,
            )

        return [ScreenshotResponse(**result) for result in results]

    except Exception as e:
        logging.error(f"搜索截图失败: {e}")

        # 记录失败的用户行为（如果behavior_tracker可用）
        response_time = (datetime.now() - start_time).total_seconds() * 1000
        if deps.behavior_tracker is not None:
            deps.behavior_tracker.track_action(
                action_type="search",
                action_details={
                    "query": search_request.query,
                    "app_name": search_request.app_name,
                    "error": str(e),
                    "success": False,
                },
                user_agent=request.headers.get("user-agent", "") if request else "",
                ip_address=request.client.host if request and request.client else "unknown",
                response_time=response_time,
            )

        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/event-search", response_model=list[EventResponse])
async def search_events(search_request: SearchRequest):
    """事件级简单文本搜索：按OCR分组后返回事件摘要"""
    try:
        results = deps.db_manager.search_events_simple(
            query=search_request.query,
            start_date=search_request.start_date,
            end_date=search_request.end_date,
            app_name=search_request.app_name,
            limit=search_request.limit,
        )
        return [EventResponse(**r) for r in results]
    except Exception as e:
        logging.error(f"搜索事件失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
