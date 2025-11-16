import logging
import os
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from lifetrace.storage.models import (
    AppUsageLog,
    Base,
    Chat,
    Event,
    EventAssociation,
    Message,
    OCRResult,
    ProcessingQueue,
    Project,
    Screenshot,
    SearchIndex,
    Task,
)
from lifetrace.util.config import config
from lifetrace.util.utils import ensure_dir


class DatabaseManager:
    """数据库管理器"""

    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or f"sqlite:///{config.database_path}"
        self.engine = None
        self.SessionLocal = None
        self._init_database()

    def _init_database(self):
        """初始化数据库"""
        try:
            # 确保数据库目录存在
            if self.database_url.startswith("sqlite:///"):
                db_path = self.database_url.replace("sqlite:///", "")
                ensure_dir(os.path.dirname(db_path))

            # 创建引擎
            self.engine = create_engine(self.database_url, echo=False, pool_pre_ping=True)

            # 创建会话工厂
            self.SessionLocal = sessionmaker(bind=self.engine)

            # 创建表
            Base.metadata.create_all(bind=self.engine)

            logging.info(f"数据库初始化完成: {self.database_url}")

            # 轻量级迁移：为已存在的 screenshots 表添加 event_id 列
            try:
                if self.database_url.startswith("sqlite:///"):
                    with self.engine.connect() as conn:
                        cols = [
                            row[1]
                            for row in conn.execute(
                                text("PRAGMA table_info('screenshots')")
                            ).fetchall()
                        ]
                        if "event_id" not in cols:
                            conn.execute(
                                text("ALTER TABLE screenshots ADD COLUMN event_id INTEGER")
                            )
                            logging.info("已为 screenshots 表添加 event_id 列")
            except Exception as me:
                logging.warning(f"检查/添加 screenshots.event_id 列失败: {me}")

            # 轻量级迁移：为已存在的 events 表添加 task_id 列
            try:
                if self.database_url.startswith("sqlite:///"):
                    with self.engine.connect() as conn:
                        cols = [
                            row[1]
                            for row in conn.execute(text("PRAGMA table_info('events')")).fetchall()
                        ]
                        if "task_id" not in cols:
                            conn.execute(text("ALTER TABLE events ADD COLUMN task_id INTEGER"))
                            logging.info("已为 events 表添加 task_id 列")
            except Exception as me:
                logging.warning(f"检查/添加 events.task_id 列失败: {me}")

            # 性能优化：添加关键索引
            self._create_performance_indexes()

        except Exception as e:
            logging.error(f"数据库初始化失败: {e}")
            raise

    def _create_performance_indexes(self):
        """创建性能优化索引"""
        try:
            if self.database_url.startswith("sqlite:///"):
                with self.engine.connect() as conn:
                    # 获取现有索引列表
                    existing_indexes = [
                        row[1]
                        for row in conn.execute(
                            text("SELECT name, sql FROM sqlite_master WHERE type='index'")
                        ).fetchall()
                    ]

                    # 定义需要创建的索引
                    indexes_to_create = [
                        (
                            "idx_ocr_results_screenshot_id",
                            "CREATE INDEX IF NOT EXISTS idx_ocr_results_screenshot_id ON ocr_results(screenshot_id)",
                        ),
                        (
                            "idx_screenshots_created_at",
                            "CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at)",
                        ),
                        (
                            "idx_screenshots_app_name",
                            "CREATE INDEX IF NOT EXISTS idx_screenshots_app_name ON screenshots(app_name)",
                        ),
                        (
                            "idx_screenshots_event_id",
                            "CREATE INDEX IF NOT EXISTS idx_screenshots_event_id ON screenshots(event_id)",
                        ),
                        (
                            "idx_processing_queue_status",
                            "CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status)",
                        ),
                        (
                            "idx_processing_queue_task_type",
                            "CREATE INDEX IF NOT EXISTS idx_processing_queue_task_type ON processing_queue(task_type)",
                        ),
                    ]

                    # 创建索引
                    for index_name, create_sql in indexes_to_create:
                        if index_name not in existing_indexes:
                            conn.execute(text(create_sql))
                            logging.info(f"已创建性能索引: {index_name}")

                    conn.commit()
                    logging.info("性能索引创建完成")

        except Exception as e:
            logging.warning(f"创建性能索引失败: {e}")
            raise

    @contextmanager
    def get_session(self):
        """获取数据库会话上下文管理器"""
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logging.error(f"数据库操作失败: {e}")
            raise
        finally:
            session.close()

    def add_screenshot(
        self,
        file_path: str,
        file_hash: str,
        width: int,
        height: int,
        screen_id: int = 0,
        app_name: str = None,
        window_title: str = None,
        event_id: int | None = None,
    ) -> int | None:
        """添加截图记录"""
        try:
            with self.get_session() as session:
                # 首先检查是否已存在相同路径的截图
                existing_path = session.query(Screenshot).filter_by(file_path=file_path).first()
                if existing_path:
                    logging.debug(f"跳过重复路径截图: {file_path}")
                    return existing_path.id

                # 检查是否已存在相同哈希的截图
                existing_hash = session.query(Screenshot).filter_by(file_hash=file_hash).first()
                if existing_hash and config.get("jobs.recorder.deduplicate", True):
                    logging.debug(f"跳过重复哈希截图: {file_path}")
                    return existing_hash.id

                file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0

                screenshot = Screenshot(
                    file_path=file_path,
                    file_hash=file_hash,
                    file_size=file_size,
                    width=width,
                    height=height,
                    screen_id=screen_id,
                    app_name=app_name,
                    window_title=window_title,
                    event_id=event_id,
                )

                session.add(screenshot)
                session.flush()  # 获取ID

                logging.debug(f"添加截图记录: {screenshot.id}")
                return screenshot.id

        except SQLAlchemyError as e:
            logging.error(f"添加截图记录失败: {e}")
            return None

    # 事件管理
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

        简单规则：
        - 应用名相同 + 窗口标题相同 → 复用事件
        - 应用名不同 或 窗口标题不同 → 创建新事件

        这样：
        - 浏览器访问不同网页 → 不同事件
        - 编辑器打开不同文件 → 不同事件
        - 同一文件持续编辑 → 同一事件

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

        # 应用名不同 → 不复用
        if old_app_norm != new_app_norm:
            logging.debug(f"应用切换: {old_app} → {new_app}")
            return False

        # 窗口标题不同 → 不复用
        if old_title_norm != new_title_norm:
            logging.debug(f"窗口标题变化: {old_title} → {new_title}")
            return False

        # 应用名和标题都相同 → 复用
        return True

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

            with self.get_session() as session:
                now_ts = timestamp or datetime.now()
                last_event = self._get_last_open_event(session)

                # 判断是否应该复用事件
                if last_event:
                    should_reuse = self._should_reuse_event(
                        old_app=last_event.app_name,
                        old_title=last_event.window_title,
                        new_app=app_name,
                        new_title=window_title,
                    )

                    if should_reuse:
                        # 复用事件，更新窗口标题
                        if window_title and window_title != last_event.window_title:
                            last_event.window_title = window_title
                        session.flush()
                        return last_event.id
                    else:
                        # 不复用，关闭旧事件
                        last_event.end_time = now_ts
                        closed_event_id = last_event.id
                        session.flush()
                        logging.info(
                            f"关闭事件 {closed_event_id}: {last_event.app_name} - {last_event.window_title}"
                        )

                # 创建新事件
                new_event = Event(app_name=app_name, window_title=window_title, start_time=now_ts)
                session.add(new_event)
                session.flush()
                new_event_id = new_event.id
                logging.info(f"创建新事件 {new_event_id}: {app_name} - {window_title}")

            # 在session关闭后，异步生成已关闭事件的摘要
            if closed_event_id:
                try:
                    from lifetrace.llm.event_summary_service import (
                        generate_event_summary_async,
                    )

                    generate_event_summary_async(closed_event_id)
                except Exception as e:
                    logging.error(f"触发事件摘要生成失败: {e}")

            return new_event_id
        except SQLAlchemyError as e:
            logging.error(f"获取或创建事件失败: {e}")
            return None

    def close_active_event(self, end_time: datetime | None = None) -> bool:
        """主动结束当前事件（可在程序退出时调用）"""
        try:
            closed_event_id = None
            with self.get_session() as session:
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
                    logging.error(f"触发事件摘要生成失败: {e}")

            return closed_event_id is not None
        except SQLAlchemyError as e:
            logging.error(f"结束事件失败: {e}")
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
            with self.get_session() as session:
                event = session.query(Event).filter(Event.id == event_id).first()
                if event:
                    event.ai_title = ai_title
                    event.ai_summary = ai_summary
                    session.commit()
                    logging.info(f"事件 {event_id} AI摘要更新成功")
                    return True
                else:
                    logging.warning(f"事件 {event_id} 不存在")
                    return False
        except SQLAlchemyError as e:
            logging.error(f"更新事件AI摘要失败: {e}")
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
            with self.get_session() as session:
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
            logging.error(f"列出事件失败: {e}")
            return []

    def count_events(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
    ) -> int:
        """统计事件总数"""
        try:
            with self.get_session() as session:
                q = session.query(Event)
                if start_date:
                    q = q.filter(Event.start_time >= start_date)
                if end_date:
                    q = q.filter(Event.start_time <= end_date)
                if app_name:
                    q = q.filter(Event.app_name.like(f"%{app_name}%"))
                return q.count()
        except SQLAlchemyError as e:
            logging.error(f"统计事件总数失败: {e}")
            return 0

    def get_event_screenshots(self, event_id: int) -> list[dict[str, Any]]:
        """获取事件内截图列表"""
        try:
            with self.get_session() as session:
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
            logging.error(f"获取事件截图失败: {e}")
            return []

    def search_events_simple(
        self,
        query: str | None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        app_name: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """基于SQLite的简单事件搜索（按OCR文本聚合）"""
        try:
            with self.get_session() as session:
                base_sql = """
                    SELECT e.id AS event_id,
                           e.app_name AS app_name,
                           e.window_title AS window_title,
                           e.start_time AS start_time,
                           e.end_time AS end_time,
                           MIN(s.id) AS first_screenshot_id,
                           COUNT(s.id) AS screenshot_count
                    FROM events e
                    JOIN screenshots s ON s.event_id = e.id
                    LEFT JOIN ocr_results o ON o.screenshot_id = s.id
                """
                where_clause = []
                params: dict[str, Any] = {}

                if query and query.strip():
                    where_clause.append("(o.text_content LIKE :q)")
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

                logging.info(f"执行搜索SQL: {sql}")
                logging.info(f"参数: {params}")
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
                            "first_screenshot_id": r.first_screenshot_id,
                            "screenshot_count": r.screenshot_count,
                        }
                    )
                return results
        except SQLAlchemyError as e:
            logging.error(f"搜索事件失败: {e}")
            return []

    def get_event_summary(self, event_id: int) -> dict[str, Any] | None:
        """获取单个事件的摘要信息"""
        try:
            with self.get_session() as session:
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
            logging.error(f"获取事件摘要失败: {e}")
            return None

    def get_event_id_by_screenshot(self, screenshot_id: int) -> int | None:
        """根据截图ID获取所属事件ID"""
        try:
            with self.get_session() as session:
                s = session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                return int(s.event_id) if s and s.event_id is not None else None
        except SQLAlchemyError as e:
            logging.error(f"查询截图所属事件失败: {e}")
            return None

    def get_event_text(self, event_id: int) -> str:
        """聚合事件下所有截图的OCR文本内容，按时间排序拼接"""
        try:
            with self.get_session() as session:
                from lifetrace.storage.models import OCRResult

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
            logging.error(f"聚合事件文本失败: {e}")
            return ""

    def add_ocr_result(
        self,
        screenshot_id: int,
        text_content: str,
        confidence: float = 0.0,
        language: str = "ch",
        processing_time: float = 0.0,
    ) -> int | None:
        """添加OCR结果"""
        try:
            with self.get_session() as session:
                ocr_result = OCRResult(
                    screenshot_id=screenshot_id,
                    text_content=text_content,
                    confidence=confidence,
                    language=language,
                    processing_time=processing_time,
                )

                session.add(ocr_result)
                session.flush()

                # 更新截图处理状态
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    screenshot.is_processed = True
                    screenshot.processed_at = datetime.now()

                logging.debug(f"添加OCR结果: {ocr_result.id}")
                return ocr_result.id

        except SQLAlchemyError as e:
            logging.error(f"添加OCR结果失败: {e}")
            return None

    def add_processing_task(self, screenshot_id: int, task_type: str = "ocr") -> int | None:
        """添加处理任务到队列"""
        try:
            with self.get_session() as session:
                # 检查是否已存在相同任务
                existing = (
                    session.query(ProcessingQueue)
                    .filter_by(
                        screenshot_id=screenshot_id,
                        task_type=task_type,
                        status="pending",
                    )
                    .first()
                )

                if existing:
                    return existing.id

                task = ProcessingQueue(screenshot_id=screenshot_id, task_type=task_type)

                session.add(task)
                session.flush()

                logging.debug(f"添加处理任务: {task.id}")
                return task.id

        except SQLAlchemyError as e:
            logging.error(f"添加处理任务失败: {e}")
            return None

    def get_pending_tasks(self, task_type: str = "ocr", limit: int = 10) -> list[ProcessingQueue]:
        """获取待处理任务"""
        try:
            with self.get_session() as session:
                tasks = (
                    session.query(ProcessingQueue)
                    .filter_by(task_type=task_type, status="pending")
                    .order_by(ProcessingQueue.created_at)
                    .limit(limit)
                    .all()
                )

                # 分离对象，避免会话关闭后访问问题
                return [self._detach_task(task) for task in tasks]

        except SQLAlchemyError as e:
            logging.error(f"获取待处理任务失败: {e}")
            return []

    def _detach_task(self, task: ProcessingQueue) -> ProcessingQueue:
        """分离任务对象"""
        detached = ProcessingQueue()
        detached.id = task.id
        detached.screenshot_id = task.screenshot_id
        detached.task_type = task.task_type
        detached.status = task.status
        detached.retry_count = task.retry_count
        detached.error_message = task.error_message
        detached.created_at = task.created_at
        detached.updated_at = task.updated_at
        return detached

    def update_task_status(self, task_id: int, status: str, error_message: str = None):
        """更新任务状态"""
        try:
            with self.get_session() as session:
                task = session.query(ProcessingQueue).filter_by(id=task_id).first()
                if task:
                    task.status = status
                    task.updated_at = datetime.now()

                    if status == "failed":
                        task.retry_count += 1
                        task.error_message = error_message

                    logging.debug(f"更新任务状态: {task_id} -> {status}")

        except SQLAlchemyError as e:
            logging.error(f"更新任务状态失败: {e}")

    def get_screenshot_by_id(self, screenshot_id: int) -> dict | None:
        """根据ID获取截图"""
        try:
            with self.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    # 转换为字典避免会话分离问题
                    return {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "file_hash": screenshot.file_hash,
                        "file_size": screenshot.file_size,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "screen_id": screenshot.screen_id,
                        "app_name": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "created_at": screenshot.created_at,
                        "processed_at": screenshot.processed_at,
                        "is_processed": screenshot.is_processed,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"获取截图失败: {e}")
            return None

    def get_screenshot_by_path(self, file_path: str) -> dict | None:
        """根据文件路径获取截图"""
        try:
            with self.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(file_path=file_path).first()
                if screenshot:
                    # 转换为字典避免会话分离问题
                    return {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "file_hash": screenshot.file_hash,
                        "file_size": screenshot.file_size,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "screen_id": screenshot.screen_id,
                        "app_name": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "created_at": screenshot.created_at,
                        "processed_at": screenshot.processed_at,
                        "is_processed": screenshot.is_processed,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"根据路径获取截图失败: {e}")
            return None

    def update_screenshot_processed(self, screenshot_id: int):
        """更新截图处理状态"""
        try:
            with self.get_session() as session:
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    screenshot.is_processed = True
                    screenshot.processed_at = datetime.now()
                    logging.debug(f"更新截图处理状态: {screenshot_id}")
                else:
                    logging.warning(f"未找到截图记录: {screenshot_id}")
        except SQLAlchemyError as e:
            logging.error(f"更新截图处理状态失败: {e}")

    def get_ocr_results_by_screenshot(self, screenshot_id: int) -> list[dict[str, Any]]:
        """根据截图ID获取OCR结果"""
        try:
            with self.get_session() as session:
                ocr_results = session.query(OCRResult).filter_by(screenshot_id=screenshot_id).all()

                # 转换为字典列表
                results = []
                for ocr in ocr_results:
                    results.append(
                        {
                            "id": ocr.id,
                            "screenshot_id": ocr.screenshot_id,
                            "text_content": ocr.text_content,
                            "confidence": ocr.confidence,
                            "language": ocr.language,
                            "processing_time": ocr.processing_time,
                            "created_at": ocr.created_at,
                        }
                    )

                return results

        except SQLAlchemyError as e:
            logging.error(f"获取OCR结果失败: {e}")
            return []

    def search_screenshots(
        self,
        query: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        app_name: str = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """搜索截图"""
        try:
            with self.get_session() as session:
                # 基础查询
                query_obj = session.query(Screenshot, OCRResult.text_content).outerjoin(
                    OCRResult, Screenshot.id == OCRResult.screenshot_id
                )

                # 添加条件
                if start_date:
                    query_obj = query_obj.filter(Screenshot.created_at >= start_date)

                if end_date:
                    query_obj = query_obj.filter(Screenshot.created_at <= end_date)

                if app_name:
                    query_obj = query_obj.filter(Screenshot.app_name.like(f"%{app_name}%"))

                if query:
                    query_obj = query_obj.filter(OCRResult.text_content.like(f"%{query}%"))

                # 应用分页：先排序，再应用offset和limit
                results = (
                    query_obj.order_by(Screenshot.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                # 格式化结果
                formatted_results = []
                for screenshot, text_content in results:
                    formatted_results.append(
                        {
                            "id": screenshot.id,
                            "file_path": screenshot.file_path,
                            "app_name": screenshot.app_name,
                            "window_title": screenshot.window_title,
                            "created_at": screenshot.created_at,
                            "text_content": text_content,
                            "width": screenshot.width,
                            "height": screenshot.height,
                        }
                    )

                return formatted_results

        except SQLAlchemyError as e:
            logging.error(f"搜索截图失败: {e}")
            return []

    def get_statistics(self) -> dict[str, Any]:
        """获取统计信息"""
        try:
            with self.get_session() as session:
                total_screenshots = session.query(Screenshot).count()
                processed_screenshots = (
                    session.query(Screenshot).filter_by(is_processed=True).count()
                )
                pending_tasks = session.query(ProcessingQueue).filter_by(status="pending").count()

                # 今日统计
                today = datetime.now().date()
                today_start = datetime.combine(today, datetime.min.time())
                today_screenshots = (
                    session.query(Screenshot).filter(Screenshot.created_at >= today_start).count()
                )

                return {
                    "total_screenshots": total_screenshots,
                    "processed_screenshots": processed_screenshots,
                    "pending_tasks": pending_tasks,
                    "today_screenshots": today_screenshots,
                    "processing_rate": processed_screenshots / max(total_screenshots, 1) * 100,
                }

        except SQLAlchemyError as e:
            logging.error(f"获取统计信息失败: {e}")
            return {}

    def cleanup_old_data(self, max_days: int):
        """清理旧数据"""
        if max_days <= 0:
            return

        try:
            cutoff_date = datetime.now() - timedelta(days=max_days)

            with self.get_session() as session:
                # 获取要删除的截图
                old_screenshots = (
                    session.query(Screenshot).filter(Screenshot.created_at < cutoff_date).all()
                )

                deleted_count = 0
                for screenshot in old_screenshots:
                    # 删除相关的OCR结果
                    session.query(OCRResult).filter_by(screenshot_id=screenshot.id).delete()

                    # 删除相关的搜索索引
                    session.query(SearchIndex).filter_by(screenshot_id=screenshot.id).delete()

                    # 删除相关的处理队列
                    session.query(ProcessingQueue).filter_by(screenshot_id=screenshot.id).delete()

                    # 删除文件
                    if os.path.exists(screenshot.file_path):
                        try:
                            os.remove(screenshot.file_path)
                        except Exception as e:
                            logging.error(f"删除文件失败 {screenshot.file_path}: {e}")

                    # 删除截图记录
                    session.delete(screenshot)
                    deleted_count += 1

                logging.info(f"清理了 {deleted_count} 条旧数据")

        except SQLAlchemyError as e:
            logging.error(f"清理旧数据失败: {e}")

    def add_app_usage_log(
        self,
        app_name: str,
        window_title: str = None,
        duration_seconds: int = 0,
        screen_id: int = 0,
        timestamp: datetime = None,
    ) -> int | None:
        """添加应用使用记录"""
        try:
            with self.get_session() as session:
                app_usage_log = AppUsageLog(
                    app_name=app_name,
                    window_title=window_title,
                    duration_seconds=duration_seconds,
                    screen_id=screen_id,
                    timestamp=timestamp or datetime.now(),
                )
                session.add(app_usage_log)
                session.commit()
                return app_usage_log.id
        except SQLAlchemyError as e:
            logging.error(f"添加应用使用记录失败: {e}")
            return None

    def get_app_usage_stats(
        self, days: int = None, start_date: datetime = None, end_date: datetime = None
    ) -> dict[str, Any]:
        """获取应用使用统计数据，支持按天数或日期区间查询"""
        try:
            with self.get_session() as session:
                # 计算时间范围（优先使用日期区间）
                if start_date and end_date:
                    dt_start = start_date
                    dt_end = end_date + timedelta(days=1) - timedelta(seconds=1)  # 包含当天
                else:
                    dt_end = datetime.now()
                    use_days = days if days else 7
                    dt_start = dt_end - timedelta(days=use_days)

                # 查询指定时间范围内的应用使用记录
                logs = (
                    session.query(AppUsageLog)
                    .filter(
                        AppUsageLog.timestamp >= dt_start,
                        AppUsageLog.timestamp <= dt_end,
                    )
                    .all()
                )

                # 按应用名称聚合数据
                app_usage_summary = {}
                daily_usage = {}
                hourly_usage = {}

                for log in logs:
                    app_name = log.app_name
                    date_str = log.timestamp.strftime("%Y-%m-%d")
                    hour = log.timestamp.hour

                    # 应用使用汇总
                    if app_name not in app_usage_summary:
                        app_usage_summary[app_name] = {
                            "app_name": app_name,
                            "total_time": 0,
                            "session_count": 0,
                            "last_used": log.timestamp,
                        }

                    app_usage_summary[app_name]["total_time"] += log.duration_seconds
                    app_usage_summary[app_name]["session_count"] += 1
                    if log.timestamp > app_usage_summary[app_name]["last_used"]:
                        app_usage_summary[app_name]["last_used"] = log.timestamp

                    # 每日使用统计
                    if date_str not in daily_usage:
                        daily_usage[date_str] = {}
                    if app_name not in daily_usage[date_str]:
                        daily_usage[date_str][app_name] = 0
                    daily_usage[date_str][app_name] += log.duration_seconds

                    # 小时使用统计
                    if hour not in hourly_usage:
                        hourly_usage[hour] = {}
                    if app_name not in hourly_usage[hour]:
                        hourly_usage[hour][app_name] = 0
                    hourly_usage[hour][app_name] += log.duration_seconds

                return {
                    "app_usage_summary": app_usage_summary,
                    "daily_usage": daily_usage,
                    "hourly_usage": hourly_usage,
                    "total_apps": len(app_usage_summary),
                    "total_time": sum(app["total_time"] for app in app_usage_summary.values()),
                }

        except SQLAlchemyError as e:
            logging.error(f"获取应用使用统计失败: {e}")
            return {
                "app_usage_summary": {},
                "daily_usage": {},
                "hourly_usage": {},
                "total_apps": 0,
                "total_time": 0,
            }

    # 项目管理
    def create_project(self, name: str, goal: str = None) -> int | None:
        """创建新项目"""
        try:
            with self.get_session() as session:
                project = Project(name=name, goal=goal)
                session.add(project)
                session.flush()
                logging.info(f"创建项目: {project.id} - {name}")
                return project.id
        except SQLAlchemyError as e:
            logging.error(f"创建项目失败: {e}")
            return None

    def get_project(self, project_id: int) -> dict[str, Any] | None:
        """获取单个项目"""
        try:
            with self.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if project:
                    return {
                        "id": project.id,
                        "name": project.name,
                        "goal": project.goal,
                        "created_at": project.created_at,
                        "updated_at": project.updated_at,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"获取项目失败: {e}")
            return None

    def list_projects(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        """列出所有项目"""
        try:
            with self.get_session() as session:
                projects = (
                    session.query(Project)
                    .order_by(Project.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )
                return [
                    {
                        "id": p.id,
                        "name": p.name,
                        "goal": p.goal,
                        "created_at": p.created_at,
                        "updated_at": p.updated_at,
                    }
                    for p in projects
                ]
        except SQLAlchemyError as e:
            logging.error(f"列出项目失败: {e}")
            return []

    def update_project(self, project_id: int, name: str = None, goal: str = None) -> bool:
        """更新项目"""
        try:
            with self.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logging.warning(f"项目不存在: {project_id}")
                    return False

                if name is not None:
                    project.name = name
                if goal is not None:
                    project.goal = goal

                project.updated_at = datetime.now()
                session.flush()
                logging.info(f"更新项目: {project_id}")
                return True
        except SQLAlchemyError as e:
            logging.error(f"更新项目失败: {e}")
            return False

    def delete_project(self, project_id: int) -> bool:
        """删除项目"""
        try:
            with self.get_session() as session:
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logging.warning(f"项目不存在: {project_id}")
                    return False

                session.delete(project)
                session.flush()
                logging.info(f"删除项目: {project_id}")
                return True
        except SQLAlchemyError as e:
            logging.error(f"删除项目失败: {e}")
            return False

    # 任务管理
    def create_task(
        self,
        project_id: int,
        name: str,
        description: str = None,
        status: str = "pending",
        parent_task_id: int | None = None,
    ) -> int | None:
        """创建新任务"""
        try:
            with self.get_session() as session:
                # 验证项目是否存在
                project = session.query(Project).filter_by(id=project_id).first()
                if not project:
                    logging.warning(f"项目不存在: {project_id}")
                    return None

                # 如果有父任务，验证父任务是否存在且属于同一项目
                if parent_task_id:
                    parent_task = session.query(Task).filter_by(id=parent_task_id).first()
                    if not parent_task:
                        logging.warning(f"父任务不存在: {parent_task_id}")
                        return None
                    if parent_task.project_id != project_id:
                        logging.warning(f"父任务 {parent_task_id} 不属于项目 {project_id}")
                        return None

                task = Task(
                    project_id=project_id,
                    name=name,
                    description=description,
                    status=status,
                    parent_task_id=parent_task_id,
                )
                session.add(task)
                session.flush()
                logging.info(f"创建任务: {task.id} - {name}")
                return task.id
        except SQLAlchemyError as e:
            logging.error(f"创建任务失败: {e}")
            return None

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        """获取单个任务"""
        try:
            with self.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if task:
                    return {
                        "id": task.id,
                        "project_id": task.project_id,
                        "name": task.name,
                        "description": task.description,
                        "status": task.status,
                        "parent_task_id": task.parent_task_id,
                        "created_at": task.created_at,
                        "updated_at": task.updated_at,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"获取任务失败: {e}")
            return None

    def list_tasks(
        self,
        project_id: int,
        limit: int = 100,
        offset: int = 0,
        parent_task_id: int | None = None,
        include_subtasks: bool = True,
    ) -> list[dict[str, Any]]:
        """列出项目的所有任务

        Args:
            project_id: 项目ID
            limit: 返回数量限制
            offset: 偏移量
            parent_task_id: 父任务ID，None表示只返回顶层任务
            include_subtasks: 是否包含子任务（如果parent_task_id为None）
        """
        try:
            with self.get_session() as session:
                q = session.query(Task).filter(Task.project_id == project_id)

                # 根据参数过滤
                if parent_task_id is not None:
                    # 获取指定父任务的子任务
                    q = q.filter(Task.parent_task_id == parent_task_id)
                elif not include_subtasks:
                    # 只获取顶层任务（没有父任务的任务）
                    q = q.filter(Task.parent_task_id.is_(None))

                tasks = q.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

                return [
                    {
                        "id": t.id,
                        "project_id": t.project_id,
                        "name": t.name,
                        "description": t.description,
                        "status": t.status,
                        "parent_task_id": t.parent_task_id,
                        "created_at": t.created_at,
                        "updated_at": t.updated_at,
                    }
                    for t in tasks
                ]
        except SQLAlchemyError as e:
            logging.error(f"列出任务失败: {e}")
            return []

    def count_tasks(self, project_id: int, parent_task_id: int | None = None) -> int:
        """统计项目的任务数量"""
        try:
            with self.get_session() as session:
                q = session.query(Task).filter(Task.project_id == project_id)
                if parent_task_id is not None:
                    q = q.filter(Task.parent_task_id == parent_task_id)
                return q.count()
        except SQLAlchemyError as e:
            logging.error(f"统计任务数量失败: {e}")
            return 0

    def update_task(
        self,
        task_id: int,
        name: str = None,
        description: str = None,
        status: str = None,
        parent_task_id: int | None = None,
    ) -> bool:
        """更新任务"""
        try:
            with self.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if not task:
                    logging.warning(f"任务不存在: {task_id}")
                    return False

                # 如果要更新父任务，验证父任务
                if parent_task_id is not None and parent_task_id != task.parent_task_id:
                    # 防止循环引用
                    if parent_task_id == task_id:
                        logging.warning(f"任务不能设置自己为父任务: {task_id}")
                        return False

                    parent_task = session.query(Task).filter_by(id=parent_task_id).first()
                    if not parent_task:
                        logging.warning(f"父任务不存在: {parent_task_id}")
                        return False
                    if parent_task.project_id != task.project_id:
                        logging.warning(f"父任务 {parent_task_id} 不属于同一项目")
                        return False

                if name is not None:
                    task.name = name
                if description is not None:
                    task.description = description
                if status is not None:
                    task.status = status
                if parent_task_id is not None:
                    task.parent_task_id = parent_task_id

                task.updated_at = datetime.now()
                session.flush()
                logging.info(f"更新任务: {task_id}")
                return True
        except SQLAlchemyError as e:
            logging.error(f"更新任务失败: {e}")
            return False

    def delete_task(self, task_id: int) -> bool:
        """删除任务（包括其所有子任务）"""
        try:
            with self.get_session() as session:
                task = session.query(Task).filter_by(id=task_id).first()
                if not task:
                    logging.warning(f"任务不存在: {task_id}")
                    return False

                # 递归删除所有子任务
                def delete_task_and_children(tid: int):
                    # 查找所有子任务
                    children = session.query(Task).filter_by(parent_task_id=tid).all()
                    for child in children:
                        delete_task_and_children(child.id)
                    # 删除当前任务
                    t = session.query(Task).filter_by(id=tid).first()
                    if t:
                        session.delete(t)

                delete_task_and_children(task_id)
                session.flush()
                logging.info(f"删除任务及其子任务: {task_id}")
                return True
        except SQLAlchemyError as e:
            logging.error(f"删除任务失败: {e}")
            return False

    def get_task_children(self, task_id: int) -> list[dict[str, Any]]:
        """获取任务的所有直接子任务"""
        try:
            with self.get_session() as session:
                children = (
                    session.query(Task)
                    .filter_by(parent_task_id=task_id)
                    .order_by(Task.created_at.asc())
                    .all()
                )
                return [
                    {
                        "id": t.id,
                        "project_id": t.project_id,
                        "name": t.name,
                        "description": t.description,
                        "status": t.status,
                        "parent_task_id": t.parent_task_id,
                        "created_at": t.created_at,
                        "updated_at": t.updated_at,
                    }
                    for t in children
                ]
        except SQLAlchemyError as e:
            logging.error(f"获取子任务失败: {e}")
            return []

    # 上下文管理（事件与任务关联）
    def list_contexts(
        self,
        associated: bool | None = None,
        task_id: int | None = None,
        project_id: int | None = None,
        limit: int = 100,
        offset: int = 0,
        mapping_attempted: bool | None = None,
        used_in_summary: bool | None = None,
    ) -> list[dict[str, Any]]:
        """列出上下文记录（事件）

        Args:
            associated: 是否已关联任务（None表示全部，True表示已关联，False表示未关联）
            task_id: 按任务ID过滤
            project_id: 按项目ID过滤
            limit: 返回数量限制
            offset: 偏移量
            mapping_attempted: 是否已尝试过自动关联（None表示全部，True表示已尝试，False表示未尝试）
            used_in_summary: 是否已用于任务摘要（None表示全部，True表示已使用，False表示未使用）
        """
        try:
            with self.get_session() as session:
                # LEFT JOIN event_associations 以获取关联信息
                q = session.query(Event, EventAssociation).outerjoin(
                    EventAssociation, Event.id == EventAssociation.event_id
                )

                # 按关联状态过滤
                if associated is False:
                    q = q.filter(EventAssociation.task_id.is_(None))
                elif associated is True:
                    q = q.filter(EventAssociation.task_id.isnot(None))

                # 按任务ID过滤
                if task_id is not None:
                    q = q.filter(EventAssociation.task_id == task_id)

                # 按项目ID过滤
                if project_id is not None:
                    q = q.filter(EventAssociation.project_id == project_id)

                # 按自动关联尝试状态过滤
                if mapping_attempted is False:
                    q = q.filter(~Event.auto_association_attempted)
                elif mapping_attempted is True:
                    q = q.filter(Event.auto_association_attempted)

                # 按是否用于摘要过滤
                if used_in_summary is False:
                    q = q.filter(~EventAssociation.used_in_summary)
                elif used_in_summary is True:
                    q = q.filter(EventAssociation.used_in_summary)

                results = q.order_by(Event.start_time.desc()).offset(offset).limit(limit).all()

                return [
                    {
                        "id": e.id,
                        "app_name": e.app_name,
                        "window_title": e.window_title,
                        "start_time": e.start_time,
                        "end_time": e.end_time,
                        "ai_title": e.ai_title,
                        "ai_summary": e.ai_summary,
                        "task_id": assoc.task_id if assoc else None,
                        "project_id": assoc.project_id if assoc else None,
                        "created_at": e.created_at,
                        "auto_association_attempted": e.auto_association_attempted,
                    }
                    for e, assoc in results
                ]
        except SQLAlchemyError as e:
            logging.error(f"列出上下文记录失败: {e}")
            return []

    def count_contexts(
        self,
        associated: bool | None = None,
        task_id: int | None = None,
        project_id: int | None = None,
        mapping_attempted: bool | None = None,
        used_in_summary: bool | None = None,
    ) -> int:
        """统计上下文记录数量

        Args:
            associated: 是否已关联任务（None表示全部，True表示已关联，False表示未关联）
            task_id: 按任务ID过滤
            project_id: 按项目ID过滤
            mapping_attempted: 是否已尝试过自动关联（None表示全部，True表示已尝试，False表示未尝试）
            used_in_summary: 是否已用于任务摘要（None表示全部，True表示已使用，False表示未使用）
        """
        try:
            with self.get_session() as session:
                q = session.query(Event).outerjoin(
                    EventAssociation, Event.id == EventAssociation.event_id
                )

                if associated is False:
                    q = q.filter(EventAssociation.task_id.is_(None))
                elif associated is True:
                    q = q.filter(EventAssociation.task_id.isnot(None))

                if task_id is not None:
                    q = q.filter(EventAssociation.task_id == task_id)

                if project_id is not None:
                    q = q.filter(EventAssociation.project_id == project_id)

                if mapping_attempted is False:
                    q = q.filter(~Event.auto_association_attempted)
                elif mapping_attempted is True:
                    q = q.filter(Event.auto_association_attempted)

                if used_in_summary is False:
                    q = q.filter(~EventAssociation.used_in_summary)
                elif used_in_summary is True:
                    q = q.filter(EventAssociation.used_in_summary)

                return q.count()
        except SQLAlchemyError as e:
            logging.error(f"统计上下文记录数量失败: {e}")
            return 0

    def get_context(self, context_id: int) -> dict[str, Any] | None:
        """获取单个上下文记录"""
        try:
            with self.get_session() as session:
                result = (
                    session.query(Event, EventAssociation)
                    .outerjoin(EventAssociation, Event.id == EventAssociation.event_id)
                    .filter(Event.id == context_id)
                    .first()
                )

                if result:
                    event, assoc = result
                    return {
                        "id": event.id,
                        "app_name": event.app_name,
                        "window_title": event.window_title,
                        "start_time": event.start_time,
                        "end_time": event.end_time,
                        "ai_title": event.ai_title,
                        "ai_summary": event.ai_summary,
                        "task_id": assoc.task_id if assoc else None,
                        "project_id": assoc.project_id if assoc else None,
                        "created_at": event.created_at,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"获取上下文记录失败: {e}")
            return None

    def mark_contexts_used_in_summary(self, task_id: int, event_ids: list[int]) -> bool:
        """标记 event-task 关联为已用于摘要

        Args:
            task_id: 任务ID
            event_ids: 事件ID列表

        Returns:
            是否成功
        """
        try:
            with self.get_session() as session:
                # 批量更新 event_associations 表
                updated = (
                    session.query(EventAssociation)
                    .filter(
                        EventAssociation.task_id == task_id,
                        EventAssociation.event_id.in_(event_ids),
                    )
                    .update({EventAssociation.used_in_summary: True}, synchronize_session=False)
                )

                session.commit()
                logging.info(f"标记任务 {task_id} 的 {updated} 个事件关联为已用于摘要")
                return True

        except SQLAlchemyError as e:
            logging.error(f"标记事件关联为已用于摘要失败: {e}")
            return False

    def update_context_task(
        self, context_id: int, task_id: int | None, project_id: int | None = None
    ) -> bool:
        """更新上下文记录的任务关联

        注意：此方法已改为操作 event_associations 表

        Args:
            context_id: 上下文（事件）ID
            task_id: 任务ID（None表示解除关联）
            project_id: 项目ID（可选，如果不提供会从task推导）
        """
        try:
            with self.get_session() as session:
                event = session.query(Event).filter_by(id=context_id).first()
                if not event:
                    logging.warning(f"上下文记录不存在: {context_id}")
                    return False

                # 如果指定了task_id，验证任务是否存在并获取project_id
                if task_id is not None:
                    task = session.query(Task).filter_by(id=task_id).first()
                    if not task:
                        logging.warning(f"任务不存在: {task_id}")
                        return False
                    # 如果没有提供project_id，从task获取
                    if project_id is None:
                        project_id = task.project_id

                # 查找或创建关联记录
                assoc = session.query(EventAssociation).filter_by(event_id=context_id).first()
                if assoc:
                    # 更新现有关联
                    assoc.task_id = task_id
                    if project_id is not None:
                        assoc.project_id = project_id
                    assoc.association_method = "manual"
                    assoc.updated_at = datetime.now()
                else:
                    # 创建新关联
                    assoc = EventAssociation(
                        event_id=context_id,
                        task_id=task_id,
                        project_id=project_id,
                        association_method="manual",
                    )
                    session.add(assoc)

                session.flush()
                logging.info(
                    f"更新上下文记录 {context_id} 的任务关联: task_id={task_id}, project_id={project_id}"
                )
                return True
        except SQLAlchemyError as e:
            logging.error(f"更新上下文记录失败: {e}")
            return False

    def mark_context_mapping_attempted(self, context_id: int) -> bool:
        """标记上下文已尝试过自动关联

        无论自动关联成功与否，都应该调用此方法标记，避免重复处理浪费 token

        Args:
            context_id: 上下文（事件）ID

        Returns:
            是否成功标记
        """
        try:
            with self.get_session() as session:
                event = session.query(Event).filter_by(id=context_id).first()
                if not event:
                    logging.warning(f"上下文记录不存在: {context_id}")
                    return False

                event.auto_association_attempted = True
                session.flush()
                logging.debug(f"标记上下文 {context_id} 已尝试自动关联")
                return True
        except SQLAlchemyError as e:
            logging.error(f"标记上下文自动关联失败: {e}")
            return False

    def create_or_update_event_association(
        self,
        event_id: int,
        project_id: int | None = None,
        task_id: int | None = None,
        project_confidence: float | None = None,
        task_confidence: float | None = None,
        reasoning: str | None = None,
        association_method: str = "auto",
    ) -> bool:
        """创建或更新事件关联记录

        专门用于 task_context_mapper 保存 LLM 判断结果

        Args:
            event_id: 事件ID
            project_id: 项目ID
            task_id: 任务ID
            project_confidence: 项目判断置信度
            task_confidence: 任务判断置信度
            reasoning: LLM 判断理由
            association_method: 关联方式（auto/manual）

        Returns:
            是否成功
        """
        try:
            with self.get_session() as session:
                # 查找现有关联
                assoc = session.query(EventAssociation).filter_by(event_id=event_id).first()

                if assoc:
                    # 更新现有关联
                    if project_id is not None:
                        assoc.project_id = project_id
                    if task_id is not None:
                        assoc.task_id = task_id
                    if project_confidence is not None:
                        assoc.project_confidence = project_confidence
                    if task_confidence is not None:
                        assoc.task_confidence = task_confidence
                    if reasoning is not None:
                        assoc.reasoning = reasoning
                    assoc.association_method = association_method
                    assoc.updated_at = datetime.now()
                    logging.info(
                        f"更新事件关联: event_id={event_id}, project_id={project_id}, task_id={task_id}"
                    )
                else:
                    # 创建新关联
                    assoc = EventAssociation(
                        event_id=event_id,
                        project_id=project_id,
                        task_id=task_id,
                        project_confidence=project_confidence,
                        task_confidence=task_confidence,
                        reasoning=reasoning,
                        association_method=association_method,
                    )
                    session.add(assoc)
                    logging.info(
                        f"创建事件关联: event_id={event_id}, project_id={project_id}, task_id={task_id}"
                    )

                session.flush()
                return True
        except SQLAlchemyError as e:
            logging.error(f"创建或更新事件关联失败: {e}")
            return False

    # ===== 聊天会话管理 =====

    def create_chat(
        self,
        session_id: str,
        chat_type: str = "event",
        title: str | None = None,
        context_id: int | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """创建聊天会话

        Args:
            session_id: 会话ID（UUID）
            chat_type: 聊天类型（event, project, general, task等）
            title: 会话标题
            context_id: 上下文ID（根据chat_type不同而不同）
            metadata: JSON格式的元数据
        """
        try:
            with self.get_session() as session:
                chat = Chat(
                    session_id=session_id,
                    chat_type=chat_type,
                    title=title,
                    context_id=context_id,
                    extra_data=metadata,
                )
                session.add(chat)
                session.flush()

                logging.info(f"创建聊天会话: {session_id}, 类型: {chat_type}")
                return {
                    "id": chat.id,
                    "session_id": chat.session_id,
                    "chat_type": chat.chat_type,
                    "title": chat.title,
                    "context_id": chat.context_id,
                    "extra_data": chat.extra_data,
                    "created_at": chat.created_at,
                    "updated_at": chat.updated_at,
                    "last_message_at": chat.last_message_at,
                }
        except SQLAlchemyError as e:
            logging.error(f"创建聊天会话失败: {e}")
            return None

    def get_chat_by_session_id(self, session_id: str) -> dict[str, Any] | None:
        """根据session_id获取聊天会话"""
        try:
            with self.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    return {
                        "id": chat.id,
                        "session_id": chat.session_id,
                        "chat_type": chat.chat_type,
                        "title": chat.title,
                        "context_id": chat.context_id,
                        "extra_data": chat.extra_data,
                        "created_at": chat.created_at,
                        "updated_at": chat.updated_at,
                        "last_message_at": chat.last_message_at,
                    }
                return None
        except SQLAlchemyError as e:
            logging.error(f"获取聊天会话失败: {e}")
            return None

    def list_chats(
        self,
        chat_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """列出聊天会话

        Args:
            chat_type: 聊天类型过滤（可选）
            limit: 返回数量限制
            offset: 偏移量
        """
        try:
            with self.get_session() as session:
                q = session.query(Chat)

                if chat_type:
                    q = q.filter(Chat.chat_type == chat_type)

                chats = (
                    q.order_by(Chat.last_message_at.desc().nullslast(), Chat.created_at.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                return [
                    {
                        "id": c.id,
                        "session_id": c.session_id,
                        "chat_type": c.chat_type,
                        "title": c.title,
                        "context_id": c.context_id,
                        "extra_data": c.extra_data,
                        "created_at": c.created_at,
                        "updated_at": c.updated_at,
                        "last_message_at": c.last_message_at,
                    }
                    for c in chats
                ]
        except SQLAlchemyError as e:
            logging.error(f"列出聊天会话失败: {e}")
            return []

    def update_chat_title(self, session_id: str, title: str) -> bool:
        """更新聊天会话标题"""
        try:
            with self.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    chat.title = title
                    session.flush()
                    logging.info(f"更新聊天会话标题: {session_id} -> {title}")
                    return True
                return False
        except SQLAlchemyError as e:
            logging.error(f"更新聊天会话标题失败: {e}")
            return False

    def delete_chat(self, session_id: str) -> bool:
        """删除聊天会话及其所有消息"""
        try:
            with self.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if chat:
                    # 删除该会话的所有消息
                    session.query(Message).filter_by(chat_id=chat.id).delete()
                    # 删除会话
                    session.delete(chat)
                    session.flush()
                    logging.info(f"删除聊天会话: {session_id}")
                    return True
                return False
        except SQLAlchemyError as e:
            logging.error(f"删除聊天会话失败: {e}")
            return False

    # ===== 消息管理 =====

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        token_count: int | None = None,
        model: str | None = None,
        metadata: str | None = None,
    ) -> dict[str, Any] | None:
        """添加消息到聊天会话

        Args:
            session_id: 会话ID
            role: 消息角色（user, assistant, system）
            content: 消息内容
            token_count: token数量
            model: 使用的模型
            metadata: JSON格式的元数据
        """
        try:
            with self.get_session() as session:
                # 获取或创建聊天会话
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    # 如果会话不存在，自动创建
                    chat = Chat(
                        session_id=session_id,
                        chat_type="event",  # 默认类型
                    )
                    session.add(chat)
                    session.flush()
                    logging.info(f"自动创建聊天会话: {session_id}")

                # 添加消息
                message = Message(
                    chat_id=chat.id,
                    role=role,
                    content=content,
                    token_count=token_count,
                    model=model,
                    extra_data=metadata,
                )
                session.add(message)

                # 更新会话的最后消息时间
                chat.last_message_at = datetime.now()

                # 如果会话没有标题且这是第一条用户消息，可以设置标题
                if not chat.title and role == "user":
                    # 使用消息内容的前50个字符作为标题
                    chat.title = content[:50] + ("..." if len(content) > 50 else "")

                session.flush()

                logging.info(f"添加消息到会话 {session_id}: role={role}")
                return {
                    "id": message.id,
                    "chat_id": message.chat_id,
                    "role": message.role,
                    "content": message.content,
                    "token_count": message.token_count,
                    "model": message.model,
                    "extra_data": message.extra_data,
                    "created_at": message.created_at,
                }
        except SQLAlchemyError as e:
            logging.error(f"添加消息失败: {e}")
            return None

    def get_messages(
        self,
        session_id: str,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """获取聊天会话的消息列表

        Args:
            session_id: 会话ID
            limit: 返回数量限制（None表示全部）
            offset: 偏移量
        """
        try:
            with self.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    return []

                q = (
                    session.query(Message)
                    .filter_by(chat_id=chat.id)
                    .order_by(Message.created_at.asc())
                )

                if offset > 0:
                    q = q.offset(offset)
                if limit:
                    q = q.limit(limit)

                messages = q.all()

                return [
                    {
                        "id": m.id,
                        "chat_id": m.chat_id,
                        "role": m.role,
                        "content": m.content,
                        "token_count": m.token_count,
                        "model": m.model,
                        "extra_data": m.extra_data,
                        "created_at": m.created_at,
                    }
                    for m in messages
                ]
        except SQLAlchemyError as e:
            logging.error(f"获取消息列表失败: {e}")
            return []

    def get_message_count(self, session_id: str) -> int:
        """获取聊天会话的消息数量"""
        try:
            with self.get_session() as session:
                chat = session.query(Chat).filter_by(session_id=session_id).first()
                if not chat:
                    return 0

                return session.query(Message).filter_by(chat_id=chat.id).count()
        except SQLAlchemyError as e:
            logging.error(f"获取消息数量失败: {e}")
            return 0

    def get_chat_summaries(
        self,
        chat_type: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """获取聊天会话摘要列表（包含消息数量）

        Args:
            chat_type: 聊天类型过滤（可选）
            limit: 返回数量限制
        """
        try:
            with self.get_session() as session:
                q = session.query(Chat)

                if chat_type:
                    q = q.filter(Chat.chat_type == chat_type)

                chats = (
                    q.order_by(Chat.last_message_at.desc().nullslast(), Chat.created_at.desc())
                    .limit(limit)
                    .all()
                )

                summaries = []
                for chat in chats:
                    message_count = session.query(Message).filter_by(chat_id=chat.id).count()
                    summaries.append(
                        {
                            "session_id": chat.session_id,
                            "chat_type": chat.chat_type,
                            "title": chat.title,
                            "context_id": chat.context_id,
                            "created_at": chat.created_at,
                            "last_active": chat.last_message_at or chat.created_at,
                            "message_count": message_count,
                        }
                    )

                return summaries
        except SQLAlchemyError as e:
            logging.error(f"获取聊天会话摘要失败: {e}")
            return []


# 全局数据库管理器实例
db_manager = DatabaseManager()


# 数据库会话生成器（用于依赖注入）
def get_db():
    """获取数据库会话的生成器函数"""
    session = db_manager.SessionLocal()
    try:
        yield session
    finally:
        session.close()
