"""事件管理器 - 负责事件相关的数据库操作"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Event, OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class EventManager:
    """事件管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def _get_last_open_event(self, session: Session) -> Event | None:
        """获取最后一个未结束的事件"""
        return (
            session.query(Event)
            .filter(Event.end_time.is_(None))
            .order_by(Event.start_time.desc())
            .first()
        )

    def _should_reuse_event(
        self,
        old_app: str | None,
        old_title: str | None,
        new_app: str | None,
        new_title: str | None,
    ) -> bool:
        """判断是否应该复用事件

        规则：
        - 应用名相同 且 窗口标题相同 → 复用事件
        - 应用名不同 或 窗口标题不同 → 创建新事件

        这样：
        - 只有当应用名和窗口标题都相同时，才复用事件
        - 无论是应用名还是窗口标题变化，都会创建新事件

        Args:
            old_app: 旧应用名
            old_title: 旧窗口标题
            new_app: 新应用名
            new_title: 新窗口标题

        Returns:
            是否应该复用事件
        """
        # 标准化处理
        old_app_norm = (old_app or "").strip().lower()
        new_app_norm = (new_app or "").strip().lower()
        old_title_norm = (old_title or "").strip()
        new_title_norm = (new_title or "").strip()

        # 应用名不同 → 不复用，需要创建新事件
        if old_app_norm != new_app_norm:
            logger.info(f"🔄 应用切换: {old_app} → {new_app} (创建新事件)")
            return False

        # 窗口标题不同 → 不复用，需要创建新事件
        if old_title_norm != new_title_norm:
            logger.info(f"📝 窗口标题变化: {old_title} → {new_title} (创建新事件)")
            return False

        # 应用名和窗口标题都相同 → 复用事件
        logger.info("♻️  应用名和窗口标题都相同，复用事件")
        return True

    def get_active_event(self) -> int | None:
        """获取当前活跃的事件ID（用于截图任务关联事件）

        Returns:
            当前活跃的事件ID，如果没有活跃事件则返回None
        """
        try:
            with self.db_base.get_session() as session:
                last_event = self._get_last_open_event(session)
                if last_event:
                    return last_event.id
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取活跃事件失败: {e}")
            return None

    def get_or_create_event(
        self,
        app_name: str | None,
        window_title: str | None,
        timestamp: datetime | None = None,
    ) -> int | None:
        """按当前前台应用和窗口标题维护事件。

        事件切分规则：
        - 应用名相同 + 窗口标题相同 → 复用现有事件
        - 应用名不同 或 窗口标题不同 → 创建新事件

        Args:
            app_name: 应用名称
            window_title: 窗口标题
            timestamp: 时间戳

        Returns:
            事件ID
        """
        try:
            closed_event_id = None  # 记录被关闭的事件ID

            with self.db_base.get_session() as session:
                now_ts = timestamp or datetime.now()
                last_event = self._get_last_open_event(session)

                # 判断是否应该复用事件
                if last_event:
                    logger.info(
                        f"🔍 检查事件复用 - 旧事件ID: {last_event.id}, "
                        f"旧应用: '{last_event.app_name}', 新应用: '{app_name}', "
                        f"旧标题: '{last_event.window_title}', 新标题: '{window_title}'"
                    )
                    should_reuse = self._should_reuse_event(
                        old_app=last_event.app_name,
                        old_title=last_event.window_title,
                        new_app=app_name,
                        new_title=window_title,
                    )
                    logger.info(f"📊 事件复用判断结果: {should_reuse}")

                    if should_reuse:
                        # 复用事件（应用名和窗口标题都相同），不设置 end_time
                        session.flush()
                        logger.info(f"♻️  复用事件 {last_event.id}（不关闭）")
                        return last_event.id
                    else:
                        # 不复用，需要创建新事件，先关闭旧事件
                        last_event.end_time = now_ts
                        closed_event_id = last_event.id
                        session.flush()
                        logger.info(
                            f"🔚 关闭旧事件 {closed_event_id}: {last_event.app_name} - {last_event.window_title}"
                        )
                        # 继续创建新事件（代码在下面）
                else:
                    logger.info("❌ 没有找到未结束的事件，需要创建新事件")

                # 只有在没有可复用的事件时，才创建新事件
                # （要么没有旧事件，要么旧事件需要关闭）
                new_event = Event(app_name=app_name, window_title=window_title, start_time=now_ts)
                session.add(new_event)
                session.flush()
                new_event_id = new_event.id
                logger.info(
                    f"✨ 创建新事件 {new_event_id}: {app_name} - {window_title} (end_time=NULL)"
                )

            # 在session关闭后，异步生成已关闭事件的摘要
            if closed_event_id:
                try:
                    logger.info(f"📝 触发已关闭事件 {closed_event_id} 的摘要生成")
                    from lifetrace.llm.event_summary_service import (
                        generate_event_summary_async,
                    )

                    generate_event_summary_async(closed_event_id)
                except Exception as e:
                    logger.error(f"触发事件摘要生成失败: {e}")
            else:
                logger.info(f"✅ 无需生成摘要（新事件 {new_event_id}，无旧事件关闭）")

            return new_event_id
        except SQLAlchemyError as e:
            logger.error(f"获取或创建事件失败: {e}")
            return None

    def close_active_event(self, end_time: datetime | None = None) -> bool:
        """主动结束当前事件（可在程序退出时调用）"""
        try:
            closed_event_id = None
            with self.db_base.get_session() as session:
                last_event = self._get_last_open_event(session)
                if last_event and last_event.end_time is None:
                    last_event.end_time = end_time or datetime.now()
                    closed_event_id = last_event.id
                    session.flush()

            # 在session关闭后，异步生成已关闭事件的摘要
            if closed_event_id:
                try:
                    from lifetrace.llm.event_summary_service import (
                        generate_event_summary_async,
                    )

                    generate_event_summary_async(closed_event_id)
                except Exception as e:
                    logger.error(f"触发事件摘要生成失败: {e}")

            return closed_event_id is not None
        except SQLAlchemyError as e:
            logger.error(f"结束事件失败: {e}")
            return False

    def update_event_summary(self, event_id: int, ai_title: str, ai_summary: str) -> bool:
        """
        更新事件的AI生成标题和摘要

        Args:
            event_id: 事件ID
            ai_title: AI生成的标题
            ai_summary: AI生成的摘要

        Returns:
            更新是否成功
        """
        try:
            with self.db_base.get_session() as session:
                event = session.query(Event).filter(Event.id == event_id).first()
                if event:
                    event.ai_title = ai_title
                    event.ai_summary = ai_summary
                    session.commit()
                    logger.info(f"事件 {event_id} AI摘要更新成功")
                    return True
                else:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False
        except SQLAlchemyError as e:
            logger.error(f"更新事件AI摘要失败: {e}")
            return False

    def list_events(
        self,
        limit: int = 50,
        offset: int = 0,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
    ) -> list[dict[str, Any]]:
        """列出事件摘要（包含首张截图ID与截图数量）"""
        try:
            with self.db_base.get_session() as session:
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
                    # 统计截图与首图
                    first_shot = (
                        session.query(Screenshot)
                        .filter(Screenshot.event_id == ev.id)
                        .order_by(Screenshot.created_at.asc())
                        .first()
                    )
                    shot_count = (
                        session.query(Screenshot).filter(Screenshot.event_id == ev.id).count()
                    )
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
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
    ) -> int:
        """统计事件总数"""
        try:
            with self.db_base.get_session() as session:
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

    def get_event_screenshots(self, event_id: int) -> list[dict[str, Any]]:
        """获取事件内截图列表"""
        try:
            with self.db_base.get_session() as session:
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
        self,
        query: str | None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """基于SQLite的简单事件搜索（搜索窗口标题、AI标题、AI摘要和OCR文本）"""
        try:
            with self.db_base.get_session() as session:
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
                    # 搜索窗口标题、AI标题、AI摘要和OCR文本内容
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

    def get_event_summary(self, event_id: int) -> dict[str, Any] | None:
        """获取单个事件的摘要信息"""
        try:
            with self.db_base.get_session() as session:
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

    def get_events_by_ids(self, event_ids: list[int]) -> list[dict[str, Any]]:
        """批量获取事件的摘要信息

        Args:
            event_ids: 事件ID列表

        Returns:
            事件摘要列表，按ID顺序返回
        """
        if not event_ids:
            return []

        try:
            with self.db_base.get_session() as session:
                events = session.query(Event).filter(Event.id.in_(event_ids)).all()
                if not events:
                    return []

                # 创建ID到事件的映射
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
                    shot_count = (
                        session.query(Screenshot).filter(Screenshot.event_id == ev.id).count()
                    )

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

    def get_event_id_by_screenshot(self, screenshot_id: int) -> int | None:
        """根据截图ID获取所属事件ID"""
        try:
            with self.db_base.get_session() as session:
                s = session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                return int(s.event_id) if s and s.event_id is not None else None
        except SQLAlchemyError as e:
            logger.error(f"查询截图所属事件失败: {e}")
            return None

    def get_event_text(self, event_id: int) -> str:
        """聚合事件下所有截图的OCR文本内容，按时间排序拼接"""
        try:
            with self.db_base.get_session() as session:
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

    def get_active_event_by_app(self, app_name: str) -> int | None:
        """获取指定应用的活跃事件ID（status为new或processing）

        Args:
            app_name: 应用名称

        Returns:
            事件ID或None
        """
        try:
            with self.db_base.get_session() as session:
                event = (
                    session.query(Event)
                    .filter(Event.app_name == app_name, Event.status.in_(["new", "processing"]))
                    .order_by(Event.start_time.desc())
                    .first()
                )
                return event.id if event else None
        except SQLAlchemyError as e:
            logger.error(f"获取活跃事件失败: {e}")
            return None

    def create_event_for_screenshot(
        self,
        screenshot_id: int,
        app_name: str,
        window_title: str,
        timestamp: datetime,
    ) -> int | None:
        """为截图创建新事件

        Args:
            screenshot_id: 截图ID
            app_name: 应用名称
            window_title: 窗口标题
            timestamp: 时间戳

        Returns:
            事件ID
        """
        try:
            with self.db_base.get_session() as session:
                # 创建新事件
                new_event = Event(
                    app_name=app_name,
                    window_title=window_title,
                    start_time=timestamp,
                    status="new",
                )
                session.add(new_event)
                session.flush()

                # 将截图关联到事件
                screenshot = (
                    session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                )
                if screenshot:
                    screenshot.event_id = new_event.id
                    session.flush()

                logger.info(f"✨ 创建新事件 {new_event.id}: {app_name} (status=new)")
                return new_event.id
        except SQLAlchemyError as e:
            logger.error(f"创建事件失败: {e}")
            return None

    def add_screenshot_to_event(
        self,
        screenshot_id: int,
        event_id: int,
    ) -> bool:
        """将截图添加到指定事件，并更新事件状态为processing

        Args:
            screenshot_id: 截图ID
            event_id: 事件ID

        Returns:
            是否成功
        """
        try:
            with self.db_base.get_session() as session:
                screenshot = (
                    session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                )
                if not screenshot:
                    logger.warning(f"截图 {screenshot_id} 不存在")
                    return False

                event = session.query(Event).filter(Event.id == event_id).first()
                if not event:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False

                # 将截图关联到事件
                screenshot.event_id = event_id

                # 更新事件状态为 processing
                if event.status == "new":
                    event.status = "processing"

                session.flush()
                logger.debug(
                    f"截图 {screenshot_id} 已添加到事件 {event_id}，事件状态: {event.status}"
                )
                return True
        except SQLAlchemyError as e:
            logger.error(f"添加截图到事件失败: {e}")
            return False

    def complete_event(self, event_id: int, end_time: datetime) -> bool:
        """完成事件，设置状态为done并设置结束时间

        Args:
            event_id: 事件ID
            end_time: 结束时间

        Returns:
            是否成功
        """
        try:
            with self.db_base.get_session() as session:
                event = session.query(Event).filter(Event.id == event_id).first()
                if not event:
                    logger.warning(f"事件 {event_id} 不存在")
                    return False

                event.status = "done"
                event.end_time = end_time
                session.flush()

                logger.info(f"🔚 完成事件 {event_id}: {event.app_name} (status=done)")

            # 在session关闭后，异步生成已关闭事件的摘要
            try:
                logger.info(f"📝 触发已完成事件 {event_id} 的摘要生成")
                from lifetrace.llm.event_summary_service import generate_event_summary_async

                generate_event_summary_async(event_id)
            except Exception as e:
                logger.error(f"触发事件摘要生成失败: {e}")

            return True
        except SQLAlchemyError as e:
            logger.error(f"完成事件失败: {e}")
            return False

    def get_app_usage_stats(
        self, days: int = None, start_date: datetime = None, end_date: datetime = None
    ) -> dict[str, Any]:
        """基于 Event 表获取应用使用统计数据

        相比 AppUsageLog 表，使用 Event 表统计有以下优势：
        1. 更准确：使用真实的 start_time 和 end_time 计算持续时间
        2. 数据量更小：不需要每次截图都记录
        3. 逻辑更简单：减少冗余表和存储逻辑

        Args:
            days: 统计最近多少天（默认7天）
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            包含应用使用统计的字典
        """
        try:
            with self.db_base.get_session() as session:
                # 计算时间范围
                if start_date and end_date:
                    dt_start = start_date
                    dt_end = end_date + timedelta(days=1) - timedelta(seconds=1)  # 包含当天
                else:
                    dt_end = datetime.now()
                    use_days = days if days else 7
                    dt_start = dt_end - timedelta(days=use_days)

                # 查询已结束的事件（有 end_time 的事件）
                events = (
                    session.query(Event)
                    .filter(
                        Event.start_time >= dt_start,
                        Event.start_time <= dt_end,
                        Event.end_time.isnot(None),  # 只统计已结束的事件
                    )
                    .all()
                )

                # 聚合统计数据
                app_usage_summary = {}
                daily_usage = {}
                hourly_usage = {}

                for event in events:
                    app_name = event.app_name
                    if not app_name:
                        continue

                    # 计算持续时间（秒）
                    duration = (event.end_time - event.start_time).total_seconds()

                    # 日期和小时
                    date_str = event.start_time.strftime("%Y-%m-%d")
                    hour = event.start_time.hour

                    # 应用使用汇总
                    if app_name not in app_usage_summary:
                        app_usage_summary[app_name] = {
                            "app_name": app_name,
                            "total_time": 0,
                            "session_count": 0,
                            "last_used": event.end_time,
                        }

                    app_usage_summary[app_name]["total_time"] += duration
                    app_usage_summary[app_name]["session_count"] += 1
                    app_usage_summary[app_name]["last_used"] = max(
                        app_usage_summary[app_name]["last_used"], event.end_time
                    )

                    # 每日使用统计
                    if date_str not in daily_usage:
                        daily_usage[date_str] = {}
                    if app_name not in daily_usage[date_str]:
                        daily_usage[date_str][app_name] = 0
                    daily_usage[date_str][app_name] += duration

                    # 小时使用统计
                    if hour not in hourly_usage:
                        hourly_usage[hour] = {}
                    if app_name not in hourly_usage[hour]:
                        hourly_usage[hour][app_name] = 0
                    hourly_usage[hour][app_name] += duration

                return {
                    "app_usage_summary": app_usage_summary,
                    "daily_usage": daily_usage,
                    "hourly_usage": hourly_usage,
                    "total_apps": len(app_usage_summary),
                    "total_time": sum(app["total_time"] for app in app_usage_summary.values()),
                }

        except SQLAlchemyError as e:
            logger.error(f"从Event表获取应用使用统计失败: {e}")
            return {
                "app_usage_summary": {},
                "daily_usage": {},
                "hourly_usage": {},
                "total_apps": 0,
                "total_time": 0,
            }
