"""数据库基础管理器 - 负责数据库初始化和会话管理

使用 SQLModel 进行数据库管理，迁移由 Alembic 处理。
"""

import os
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, SQLModel

from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_database_path
from lifetrace.util.utils import ensure_dir

logger = get_logger()


class DatabaseBase:
    """数据库基础管理类 - 处理数据库初始化和会话管理"""

    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._init_database()

    def _init_database(self):
        """初始化数据库"""
        try:
            db_path = str(get_database_path())
            # 检查数据库文件是否已存在
            db_exists = os.path.exists(db_path)

            # 确保数据库目录存在
            ensure_dir(os.path.dirname(db_path))

            # 创建引擎
            self.engine = create_engine("sqlite:///" + db_path, echo=False, pool_pre_ping=True)

            # 创建会话工厂（兼容旧代码）
            self.SessionLocal = sessionmaker(bind=self.engine)

            # 导入所有模型以确保 metadata 包含所有表
            from lifetrace.storage import models  # noqa: F401

            # 创建表（仅在新数据库时）
            # 对于现有数据库，使用 Alembic 进行迁移
            if not db_exists:
                SQLModel.metadata.create_all(bind=self.engine)
                logger.info(f"数据库初始化完成: {db_path}")

            # 性能优化：添加关键索引
            self._create_performance_indexes()

        except Exception as e:
            logger.error(f"数据库初始化失败: {e}")
            raise

    def _create_performance_indexes(self):
        """创建性能优化索引"""
        try:
            with self.engine.connect() as conn:
                # 获取现有索引列表（只获取索引名称）
                existing_indexes = [
                    row[0]
                    for row in conn.execute(
                        text(
                            "SELECT name FROM sqlite_master WHERE type='index' AND name IS NOT NULL"
                        )
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
                        "idx_todos_parent_todo_id",
                        "CREATE INDEX IF NOT EXISTS idx_todos_parent_todo_id ON todos(parent_todo_id)",
                    ),
                    (
                        "idx_todos_status",
                        "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)",
                    ),
                    (
                        "idx_todos_deleted_at",
                        "CREATE INDEX IF NOT EXISTS idx_todos_deleted_at ON todos(deleted_at)",
                    ),
                    (
                        "idx_todos_priority",
                        "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)",
                    ),
                    (
                        "idx_todos_order",
                        'CREATE INDEX IF NOT EXISTS idx_todos_order ON todos("order")',
                    ),
                    (
                        "idx_attachments_file_hash",
                        "CREATE INDEX IF NOT EXISTS idx_attachments_file_hash ON attachments(file_hash)",
                    ),
                    (
                        "idx_attachments_deleted_at",
                        "CREATE INDEX IF NOT EXISTS idx_attachments_deleted_at ON attachments(deleted_at)",
                    ),
                    (
                        "idx_todo_attachment_relations_todo_id",
                        "CREATE INDEX IF NOT EXISTS idx_todo_attachment_relations_todo_id ON todo_attachment_relations(todo_id)",
                    ),
                    (
                        "idx_todo_attachment_relations_attachment_id",
                        "CREATE INDEX IF NOT EXISTS idx_todo_attachment_relations_attachment_id ON todo_attachment_relations(attachment_id)",
                    ),
                    (
                        "idx_tags_tag_name_unique",
                        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_tag_name_unique ON tags(tag_name)",
                    ),
                    (
                        "idx_tags_deleted_at",
                        "CREATE INDEX IF NOT EXISTS idx_tags_deleted_at ON tags(deleted_at)",
                    ),
                    (
                        "idx_todo_tag_relations_todo_id",
                        "CREATE INDEX IF NOT EXISTS idx_todo_tag_relations_todo_id ON todo_tag_relations(todo_id)",
                    ),
                    (
                        "idx_todo_tag_relations_tag_id",
                        "CREATE INDEX IF NOT EXISTS idx_todo_tag_relations_tag_id ON todo_tag_relations(tag_id)",
                    ),
                    (
                        "idx_journals_date",
                        "CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(date)",
                    ),
                    (
                        "idx_journals_deleted_at",
                        "CREATE INDEX IF NOT EXISTS idx_journals_deleted_at ON journals(deleted_at)",
                    ),
                    (
                        "idx_journal_tag_relations_journal_id",
                        "CREATE INDEX IF NOT EXISTS idx_journal_tag_relations_journal_id ON journal_tag_relations(journal_id)",
                    ),
                    (
                        "idx_journal_tag_relations_tag_id",
                        "CREATE INDEX IF NOT EXISTS idx_journal_tag_relations_tag_id ON journal_tag_relations(tag_id)",
                    ),
                    (
                        "idx_activities_start_time",
                        "CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time)",
                    ),
                    (
                        "idx_activities_end_time",
                        "CREATE INDEX IF NOT EXISTS idx_activities_end_time ON activities(end_time)",
                    ),
                    (
                        "idx_activity_event_relations_activity_id",
                        "CREATE INDEX IF NOT EXISTS idx_activity_event_relations_activity_id ON activity_event_relations(activity_id)",
                    ),
                    (
                        "idx_activity_event_relations_event_id",
                        "CREATE INDEX IF NOT EXISTS idx_activity_event_relations_event_id ON activity_event_relations(event_id)",
                    ),
                    (
                        "idx_chats_session_id",
                        "CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id)",
                    ),
                    (
                        "idx_messages_chat_id",
                        "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)",
                    ),
                ]

                # 创建索引
                created_count = 0
                for index_name, create_sql in indexes_to_create:
                    if index_name not in existing_indexes:
                        conn.execute(text(create_sql))
                        created_count += 1
                        logger.info(f"已创建性能索引: {index_name}")

                conn.commit()

                # 只在有索引被创建时打印完成信息
                if created_count > 0:
                    logger.info(f"性能索引检查完成，创建了 {created_count} 个索引")

        except Exception as e:
            logger.warning(f"创建性能索引失败: {e}")
            raise

    @contextmanager
    def get_session(self):
        """获取数据库会话上下文管理器（使用 SQLModel Session）"""
        with Session(self.engine) as session:
            try:
                yield session
                session.commit()
            except Exception as e:
                session.rollback()
                logger.error(f"数据库操作失败: {e}")
                raise

    @contextmanager
    def get_sqlalchemy_session(self):
        """获取 SQLAlchemy 会话上下文管理器（用于兼容旧代码）"""
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"数据库操作失败: {e}")
            raise
        finally:
            session.close()


# 数据库会话生成器（用于依赖注入）
def get_db(db_base: DatabaseBase):
    """获取数据库会话的生成器函数"""
    session = db_base.SessionLocal()
    try:
        yield session
    finally:
        session.close()
