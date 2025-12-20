"""Event 业务逻辑层

处理 Event 相关的业务逻辑，与数据访问层解耦。
"""

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from lifetrace.repositories.interfaces import IEventRepository, IOcrRepository
from lifetrace.schemas.event import EventDetailResponse, EventListResponse, EventResponse
from lifetrace.schemas.screenshot import ScreenshotResponse
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class EventService:
    """Event 业务逻辑层"""

    def __init__(self, event_repository: IEventRepository, ocr_repository: IOcrRepository):
        self.event_repo = event_repository
        self.ocr_repo = ocr_repository

    def list_events(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> EventListResponse:
        """获取事件列表"""
        logger.info(
            f"获取事件列表 - 参数: limit={limit}, offset={offset}, "
            f"start_date={start_date}, end_date={end_date}, app_name={app_name}"
        )

        events = self.event_repo.list_events(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )
        total_count = self.event_repo.count_events(
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

        logger.info(f"获取事件列表 - 结果: events_count={len(events)}, total_count={total_count}")

        return EventListResponse(
            events=[EventResponse(**e) for e in events],
            total_count=total_count,
        )

    def count_events(
        self,
        start_date: datetime | None,
        end_date: datetime | None,
        app_name: str | None,
    ) -> dict[str, int]:
        """获取事件总数"""
        count = self.event_repo.count_events(
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )
        return {"count": count}

    def get_event_detail(self, event_id: int) -> EventDetailResponse:
        """获取事件详情"""
        event_summary = self.event_repo.get_summary(event_id)
        if not event_summary:
            raise HTTPException(status_code=404, detail="事件不存在")

        screenshots = self.event_repo.get_screenshots(event_id)
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

    def get_event_context(self, event_id: int) -> dict[str, Any]:
        """获取事件的OCR文本上下文"""
        event_summary = self.event_repo.get_summary(event_id)
        if not event_summary:
            raise HTTPException(status_code=404, detail="事件不存在")

        screenshots = self.event_repo.get_screenshots(event_id)

        # 聚合OCR文本
        ocr_texts = []
        for screenshot in screenshots:
            ocr_results = self.ocr_repo.get_results_by_screenshot(screenshot["id"])
            if ocr_results:
                for ocr in ocr_results:
                    if ocr.get("text_content"):
                        ocr_texts.append(ocr["text_content"])
                        break

        return {
            "event_id": event_id,
            "app_name": event_summary.get("app_name"),
            "window_title": event_summary.get("window_title"),
            "start_time": event_summary.get("start_time"),
            "end_time": event_summary.get("end_time"),
            "ocr_texts": ocr_texts,
            "screenshot_count": len(screenshots),
        }

    def generate_event_summary(self, event_id: int) -> dict[str, Any]:
        """手动触发单个事件的摘要生成"""
        # 检查事件是否存在
        event_info = self.event_repo.get_summary(event_id)
        if not event_info:
            raise HTTPException(status_code=404, detail="事件不存在")

        # 延迟导入避免循环依赖
        from lifetrace.llm.event_summary_service import event_summary_service

        success = event_summary_service.generate_event_summary(event_id)

        if success:
            updated_event = self.event_repo.get_summary(event_id)
            return {
                "success": True,
                "event_id": event_id,
                "ai_title": updated_event.get("ai_title"),
                "ai_summary": updated_event.get("ai_summary"),
            }
        else:
            raise HTTPException(status_code=500, detail="摘要生成失败")

    def get_events_by_ids(self, event_ids: list[int]) -> list[dict[str, Any]]:
        """批量获取事件"""
        return self.event_repo.get_events_by_ids(event_ids)
