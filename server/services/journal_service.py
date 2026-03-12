"""Journal 业务逻辑层

处理 Journal 相关的业务逻辑，与数据访问层解耦。
"""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException
from sqlalchemy import or_

from llm.journal_generation_service import journal_generation_service
from schemas.journal import (
    JournalAutoLinkCandidate,
    JournalAutoLinkRequest,
    JournalAutoLinkResponse,
    JournalCreate,
    JournalGenerateRequest,
    JournalGenerateResponse,
    JournalListResponse,
    JournalResponse,
    JournalUpdate,
)
from storage.journal_manager import JournalCreatePayload, JournalUpdatePayload
from storage.models import Activity, Todo
from storage.sql_utils import col
from util.logging_config import get_logger

logger = get_logger()

if TYPE_CHECKING:
    from collections.abc import Callable

    from repositories.interfaces import IJournalRepository
    from storage.database_base import DatabaseBase

_DEFAULT_BUCKET_START = time(hour=4, minute=0)


class JournalService:
    """Journal 业务逻辑层"""

    def __init__(self, repository: IJournalRepository, db_base: DatabaseBase):
        self.repository = repository
        self.db_base = db_base

    def _normalize_name(self, name: str | None) -> str:
        cleaned = (name or "").strip()
        return cleaned or "Untitled"

    def _resolve_day_bucket_range(
        self, date: datetime, day_bucket_start: datetime | None
    ) -> tuple[datetime, datetime]:
        bucket_time = (day_bucket_start or date).time()
        if day_bucket_start is None:
            bucket_time = _DEFAULT_BUCKET_START

        bucket_start = datetime.combine(date.date(), bucket_time, tzinfo=date.tzinfo)
        if date < bucket_start:
            bucket_start -= timedelta(days=1)
        bucket_end = bucket_start + timedelta(days=1)
        return bucket_start, bucket_end

    def _extract_keywords(self, text: str) -> list[str]:
        if not text:
            return []
        normalized = text.lower()
        english = re.findall(r"[a-z0-9][a-z0-9_-]{1,}", normalized)
        chinese = re.findall(r"[\u4e00-\u9fff]{2,}", text)
        return sorted(set(english + chinese))

    def _score_text(self, text: str, keywords: list[str]) -> float:
        if not text or not keywords:
            return 0.0
        lowered = text.lower()
        score = sum(1 for keyword in keywords if keyword in lowered)
        return float(score)

    def _score_candidates(
        self,
        items: list[dict[str, Any]],
        keywords: list[str],
        text_builder: Callable[[dict[str, Any]], str],
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        for item in items:
            text = text_builder(item)
            score = self._score_text(text, keywords)
            if score <= 0:
                continue
            candidates.append(
                {
                    "id": item["id"],
                    "name": item.get("name") or item.get("title") or "",
                    "score": score,
                }
            )
        candidates.sort(key=lambda item: (-item["score"], item["id"]))
        return candidates

    def _list_todos_for_range(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        with self.db_base.get_session() as session:
            query = session.query(Todo).filter(col(Todo.deleted_at).is_(None))
            query = query.filter(
                or_(
                    col(Todo.start_time).between(start, end),
                    col(Todo.end_time).between(start, end),
                    col(Todo.deadline).between(start, end),
                    col(Todo.created_at).between(start, end),
                )
            )
            todos = query.order_by(col(Todo.created_at).desc()).all()
            return [
                {
                    "id": todo.id,
                    "name": todo.name,
                    "description": todo.description,
                    "user_notes": todo.user_notes,
                    "status": todo.status,
                    "deadline": todo.deadline,
                    "start_time": todo.start_time,
                    "end_time": todo.end_time,
                }
                for todo in todos
            ]

    def _list_activities_for_range(self, start: datetime, end: datetime) -> list[dict[str, Any]]:
        with self.db_base.get_session() as session:
            query = (
                session.query(Activity)
                .filter(col(Activity.deleted_at).is_(None))
                .filter(col(Activity.start_time) >= start)
                .filter(col(Activity.start_time) <= end)
            )
            activities = query.order_by(col(Activity.start_time).desc()).all()
            return [
                {
                    "id": activity.id,
                    "title": activity.ai_title or "",
                    "summary": activity.ai_summary or "",
                    "start_time": activity.start_time,
                    "end_time": activity.end_time,
                }
                for activity in activities
            ]

    def _resolve_generation_context(
        self, payload: JournalGenerateRequest
    ) -> tuple[dict[str, Any] | None, datetime, str, str, datetime | None]:
        journal = None
        if payload.journal_id is not None:
            journal = self.repository.get_by_id(payload.journal_id)
            if not journal:
                raise HTTPException(status_code=404, detail="日记不存在")

        date = payload.date or (journal.get("date") if journal else None)
        if date is None:
            raise HTTPException(status_code=400, detail="缺少日记日期")

        title = payload.title or (journal.get("name") if journal else "") or ""
        content_original = (
            payload.content_original
            if payload.content_original is not None
            else (journal.get("user_notes") if journal else "")
        )
        content_original = content_original or ""
        day_bucket_start = payload.day_bucket_start or (
            journal.get("day_bucket_start") if journal else None
        )
        return journal, date, title, content_original, day_bucket_start

    def get_journal(self, journal_id: int) -> JournalResponse:
        """获取单个日记"""
        journal = self.repository.get_by_id(journal_id)
        if not journal:
            raise HTTPException(status_code=404, detail="日记不存在")
        return JournalResponse(**journal)

    def list_journals(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> JournalListResponse:
        """获取日记列表"""
        journals = self.repository.list_journals(limit, offset, start_date, end_date)
        total = self.repository.count(start_date, end_date)
        return JournalListResponse(
            total=total,
            journals=[JournalResponse(**j) for j in journals],
        )

    def create_journal(self, data: JournalCreate) -> JournalResponse:
        """创建日记"""
        payload = JournalCreatePayload(
            uid=data.uid,
            name=self._normalize_name(data.name),
            user_notes=data.user_notes,
            date=data.date,
            content_format=data.content_format or "markdown",
            content_objective=data.content_objective,
            content_ai=data.content_ai,
            mood=data.mood,
            energy=data.energy,
            day_bucket_start=data.day_bucket_start,
            tags=data.tags,
            related_todo_ids=data.related_todo_ids,
            related_activity_ids=data.related_activity_ids,
        )
        journal_id = self.repository.create(payload)
        if not journal_id:
            raise HTTPException(status_code=500, detail="创建日记失败")

        logger.info(f"成功创建日记: {journal_id} - {payload.name}")
        return self.get_journal(journal_id)

    def _build_update_payload(self, data: JournalUpdate) -> JournalUpdatePayload:
        update_data = data.model_dump(exclude_none=True)
        if "name" in update_data:
            update_data["name"] = self._normalize_name(update_data["name"])
        return JournalUpdatePayload(**update_data)

    def update_journal(self, journal_id: int, data: JournalUpdate) -> JournalResponse:
        """更新日记"""
        if not self.repository.get_by_id(journal_id):
            raise HTTPException(status_code=404, detail="日记不存在")

        payload = self._build_update_payload(data)

        if not self.repository.update(journal_id, payload):
            raise HTTPException(status_code=500, detail="更新日记失败")

        logger.info(f"成功更新日记: {journal_id}")
        return self.get_journal(journal_id)

    def delete_journal(self, journal_id: int) -> None:
        """删除日记"""
        if not self.repository.get_by_id(journal_id):
            raise HTTPException(status_code=404, detail="日记不存在")
        if not self.repository.delete(journal_id):
            raise HTTPException(status_code=500, detail="删除日记失败")

        logger.info(f"成功删除日记: {journal_id}")

    def auto_link(self, payload: JournalAutoLinkRequest) -> JournalAutoLinkResponse:
        journal = None
        if payload.journal_id is not None:
            journal = self.repository.get_by_id(payload.journal_id)
            if not journal:
                raise HTTPException(status_code=404, detail="日记不存在")

        title = payload.title or (journal.get("name") if journal else "") or ""
        content_original = (
            payload.content_original
            if payload.content_original is not None
            else (journal.get("user_notes") if journal else "")
        )
        day_bucket_start = payload.day_bucket_start or (
            journal.get("day_bucket_start") if journal else None
        )

        start_time, end_time = self._resolve_day_bucket_range(payload.date, day_bucket_start)
        todos = self._list_todos_for_range(start_time, end_time)
        activities = self._list_activities_for_range(start_time, end_time)

        keywords = self._extract_keywords(f"{title} {content_original}")
        todo_candidates = self._score_candidates(
            todos,
            keywords,
            lambda item: " ".join(
                filter(None, [item.get("name"), item.get("description"), item.get("user_notes")])
            ),
        )
        activity_candidates = self._score_candidates(
            activities,
            keywords,
            lambda item: " ".join(filter(None, [item.get("title"), item.get("summary")])),
        )

        related_todo_ids = [c["id"] for c in todo_candidates[: payload.max_items]]
        related_activity_ids = [c["id"] for c in activity_candidates[: payload.max_items]]

        if payload.journal_id is not None:
            update_payload = JournalUpdatePayload(
                related_todo_ids=related_todo_ids,
                related_activity_ids=related_activity_ids,
            )
            self.repository.update(payload.journal_id, update_payload)

        return JournalAutoLinkResponse(
            related_todo_ids=related_todo_ids,
            related_activity_ids=related_activity_ids,
            todo_candidates=[JournalAutoLinkCandidate(**c) for c in todo_candidates],
            activity_candidates=[JournalAutoLinkCandidate(**c) for c in activity_candidates],
        )

    def generate_objective(self, payload: JournalGenerateRequest) -> JournalGenerateResponse:
        journal, date, _title, content_original, day_bucket_start = (
            self._resolve_generation_context(payload)
        )
        start_time, end_time = self._resolve_day_bucket_range(date, day_bucket_start)
        todos = self._list_todos_for_range(start_time, end_time)
        activities = self._list_activities_for_range(start_time, end_time)

        content = journal_generation_service.generate_objective(
            activities=activities,
            todos=todos,
            language=payload.language,
        )

        if journal:
            update_payload = JournalUpdatePayload(content_objective=content)
            self.repository.update(journal["id"], update_payload)

        return JournalGenerateResponse(content=content)

    def generate_ai_view(self, payload: JournalGenerateRequest) -> JournalGenerateResponse:
        journal, date, title, content_original, day_bucket_start = self._resolve_generation_context(
            payload
        )
        start_time, end_time = self._resolve_day_bucket_range(date, day_bucket_start)
        todos = self._list_todos_for_range(start_time, end_time)
        activities = self._list_activities_for_range(start_time, end_time)

        content = journal_generation_service.generate_ai_view(
            title=title,
            content_original=content_original,
            activities=activities,
            todos=todos,
            language=payload.language,
        )

        if journal:
            update_payload = JournalUpdatePayload(content_ai=content)
            self.repository.update(journal["id"], update_payload)

        return JournalGenerateResponse(content=content)
