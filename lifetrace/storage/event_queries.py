"""
事件查询模块
包含事件查询和搜索相关方法
"""

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Event, OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def list_events(
    db_base: DatabaseBase,
    limit: int = 50,
    offset: int = 0,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    app_name: str | None = None,
) -> list[dict[str, Any]]:
    """列出事件摘要（包含首张截图ID与截图数量）"""
    try:
        with db_base.get_session() as session:
            q = session.query(Event)
            if start_date:
                q = q.filter(Event.start_time >= start_date)
            if end_date:
                q = q.filter(Event.start_time <= end_date)
            if app_name:
                q = q.filter(Event.app_name.like(f"%{app_name}%"))

            q = q.order_by(Event.start_time.desc()).offset(offset).limit(limit)
            events = q.all()

            results: list[dict[str, Any]] = []
            for ev in events:
                first_shot = (
                    session.query(Screenshot)
                    .filter(Screenshot.event_id == ev.id)
                    .order_by(Screenshot.created_at.asc())
                    .first()
                )
                shot_count = session.query(Screenshot).filter(Screenshot.event_id == ev.id).count()
                results.append(
                    {
                        "id": ev.id,
                        "app_name": ev.app_name,
                        "window_title": ev.window_title,
                        "start_time": ev.start_time,
                        "end_time": ev.end_time,
                        "screenshot_count": shot_count,
                        "first_screenshot_id": (first_shot.id if first_shot else None),
                        "ai_title": ev.ai_title,
                        "ai_summary": ev.ai_summary,
                    }
                )
            return results
    except SQLAlchemyError as e:
        logger.error(f"列出事件失败: {e}")
        return []


def count_events(
    db_base: DatabaseBase,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    app_name: str | None = None,
) -> int:
    """统计事件总数"""
    try:
        with db_base.get_session() as session:
            q = session.query(Event)
            if start_date:
                q = q.filter(Event.start_time >= start_date)
            if end_date:
                q = q.filter(Event.start_time <= end_date)
            if app_name:
                q = q.filter(Event.app_name.like(f"%{app_name}%"))
            return q.count()
    except SQLAlchemyError as e:
        logger.error(f"统计事件总数失败: {e}")
        return 0


def get_event_screenshots(db_base: DatabaseBase, event_id: int) -> list[dict[str, Any]]:
    """获取事件内截图列表"""
    try:
        with db_base.get_session() as session:
            shots = (
                session.query(Screenshot)
                .filter(Screenshot.event_id == event_id)
                .order_by(Screenshot.created_at.asc())
                .all()
            )
            return [
                {
                    "id": s.id,
                    "file_path": s.file_path,
                    "app_name": s.app_name,
                    "window_title": s.window_title,
                    "created_at": s.created_at,
                    "width": s.width,
                    "height": s.height,
                }
                for s in shots
            ]
    except SQLAlchemyError as e:
        logger.error(f"获取事件截图失败: {e}")
        return []


def search_events_simple(
    db_base: DatabaseBase,
    query: str | None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    app_name: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """基于SQLite的简单事件搜索"""
    try:
        with db_base.get_session() as session:
            base_sql = """
                SELECT e.id AS event_id,
                       e.app_name AS app_name,
                       e.window_title AS window_title,
                       e.start_time AS start_time,
                       e.end_time AS end_time,
                       e.ai_title AS ai_title,
                       e.ai_summary AS ai_summary,
                       MIN(s.id) AS first_screenshot_id,
                       COUNT(s.id) AS screenshot_count
                FROM events e
                JOIN screenshots s ON s.event_id = e.id
                LEFT JOIN ocr_results o ON o.screenshot_id = s.id
            """
            where_clause = []
            params: dict[str, Any] = {}

            if query and query.strip():
                where_clause.append(
                    "(e.window_title LIKE :q OR e.ai_title LIKE :q OR e.ai_summary LIKE :q OR o.text_content LIKE :q)"
                )
                params["q"] = f"%{query}%"

            if start_date:
                where_clause.append("e.start_time >= :start_date")
                params["start_date"] = start_date

            if end_date:
                where_clause.append("e.start_time <= :end_date")
                params["end_date"] = end_date

            if app_name:
                where_clause.append("e.app_name LIKE :app_name")
                params["app_name"] = f"%{app_name}%"

            sql = base_sql
            if where_clause:
                sql += " WHERE " + " AND ".join(where_clause)
            sql += " GROUP BY e.id ORDER BY e.start_time DESC LIMIT :limit"
            params["limit"] = limit

            logger.info(f"执行搜索SQL: {sql}")
            logger.info(f"参数: {params}")
            rows = session.execute(text(sql), params).fetchall()
            results = []
            for r in rows:
                results.append(
                    {
                        "id": r.event_id,
                        "app_name": r.app_name,
                        "window_title": r.window_title,
                        "start_time": r.start_time,
                        "end_time": r.end_time,
                        "ai_title": r.ai_title,
                        "ai_summary": r.ai_summary,
                        "first_screenshot_id": r.first_screenshot_id,
                        "screenshot_count": r.screenshot_count,
                    }
                )
            return results
    except SQLAlchemyError as e:
        logger.error(f"搜索事件失败: {e}")
        return []


def get_event_summary(db_base: DatabaseBase, event_id: int) -> dict[str, Any] | None:
    """获取单个事件的摘要信息"""
    try:
        with db_base.get_session() as session:
            ev = session.query(Event).filter(Event.id == event_id).first()
            if not ev:
                return None
            first_shot = (
                session.query(Screenshot)
                .filter(Screenshot.event_id == ev.id)
                .order_by(Screenshot.created_at.asc())
                .first()
            )
            shot_count = session.query(Screenshot).filter(Screenshot.event_id == ev.id).count()
            return {
                "id": ev.id,
                "app_name": ev.app_name,
                "window_title": ev.window_title,
                "start_time": ev.start_time,
                "end_time": ev.end_time,
                "screenshot_count": shot_count,
                "first_screenshot_id": first_shot.id if first_shot else None,
                "ai_title": ev.ai_title,
                "ai_summary": ev.ai_summary,
            }
    except SQLAlchemyError as e:
        logger.error(f"获取事件摘要失败: {e}")
        return None


def get_events_by_ids(db_base: DatabaseBase, event_ids: list[int]) -> list[dict[str, Any]]:
    """批量获取事件的摘要信息"""
    if not event_ids:
        return []

    try:
        with db_base.get_session() as session:
            events = session.query(Event).filter(Event.id.in_(event_ids)).all()
            if not events:
                return []

            event_map = {ev.id: ev for ev in events}

            results = []
            for event_id in event_ids:
                ev = event_map.get(event_id)
                if not ev:
                    continue

                first_shot = (
                    session.query(Screenshot)
                    .filter(Screenshot.event_id == ev.id)
                    .order_by(Screenshot.created_at.asc())
                    .first()
                )
                shot_count = session.query(Screenshot).filter(Screenshot.event_id == ev.id).count()

                results.append(
                    {
                        "id": ev.id,
                        "app_name": ev.app_name,
                        "window_title": ev.window_title,
                        "start_time": ev.start_time,
                        "end_time": ev.end_time,
                        "screenshot_count": shot_count,
                        "first_screenshot_id": first_shot.id if first_shot else None,
                        "ai_title": ev.ai_title,
                        "ai_summary": ev.ai_summary,
                    }
                )

            return results
    except SQLAlchemyError as e:
        logger.error(f"批量获取事件摘要失败: {e}")
        return []


def get_event_id_by_screenshot(db_base: DatabaseBase, screenshot_id: int) -> int | None:
    """根据截图ID获取所属事件ID"""
    try:
        with db_base.get_session() as session:
            s = session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
            return int(s.event_id) if s and s.event_id is not None else None
    except SQLAlchemyError as e:
        logger.error(f"查询截图所属事件失败: {e}")
        return None


def get_event_text(db_base: DatabaseBase, event_id: int) -> str:
    """聚合事件下所有截图的OCR文本内容"""
    try:
        with db_base.get_session() as session:
            ocr_list = (
                session.query(OCRResult)
                .join(Screenshot, OCRResult.screenshot_id == Screenshot.id)
                .filter(Screenshot.event_id == event_id)
                .order_by(OCRResult.created_at.asc())
                .all()
            )
            texts = [o.text_content for o in ocr_list if o and o.text_content]
            return "\n".join(texts)
    except SQLAlchemyError as e:
        logger.error(f"聚合事件文本失败: {e}")
        return ""
