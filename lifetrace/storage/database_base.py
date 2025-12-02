"""数据库基础管理器 - 负责数据库初始化和会话管理"""

import os
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from lifetrace.storage.models import Base
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger
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
            # 检查数据库文件是否已存在
            db_exists = os.path.exists(config.database_path)

            # 确保数据库目录存在
            ensure_dir(os.path.dirname(config.database_path))

            # 创建引擎
            self.engine = create_engine(
                "sqlite:///" + config.database_path, echo=False, pool_pre_ping=True
            )

            # 创建会话工厂
            self.SessionLocal = sessionmaker(bind=self.engine)

            # 创建表
            Base.metadata.create_all(bind=self.engine)

            # 进行 projects 表结构迁移（确保新列存在）
            self._migrate_projects_table()

            # 只在数据库不存在时（新创建）打印日志
            if not db_exists:
                logger.info(f"数据库初始化完成: {config.database_path}")

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

    def _migrate_projects_table(self):
        """迁移 projects 表结构，添加用于 AI 上下文的字段（SQLite 兼容方式）

        - 不删除旧字段，保证向后兼容
        - 仅在目标列不存在时执行 ALTER TABLE
        """
        try:
            with self.engine.connect() as conn:
                # 检查 projects 表是否存在
                tables = [
                    row[0]
                    for row in conn.execute(
                        text(
                            "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
                        )
                    ).fetchall()
                ]
                if "projects" not in tables:
                    return

                # 获取现有列
                columns = [
                    row[1]
                    for row in conn.execute(text("PRAGMA table_info('projects')")).fetchall()
                ]

                def add_column_if_missing(column_name: str, ddl: str):
                    if column_name not in columns:
                        conn.execute(text(ddl))
                        logger.info(f"已为 projects 表添加列: {column_name}")

                # 1. 身份锚点
                add_column_if_missing(
                    "definition_of_done",
                    "ALTER TABLE projects ADD COLUMN definition_of_done TEXT",
                )
                add_column_if_missing(
                    "status",
                    "ALTER TABLE projects ADD COLUMN status VARCHAR(20) DEFAULT 'active'",
                )

                # 2. 语义指纹
                add_column_if_missing(
                    "keywords_json",
                    "ALTER TABLE projects ADD COLUMN keywords_json TEXT",
                )
                add_column_if_missing(
                    "whitelist_apps_json",
                    "ALTER TABLE projects ADD COLUMN whitelist_apps_json TEXT",
                )

                # 3. 里程碑上下文
                add_column_if_missing(
                    "milestones_json",
                    "ALTER TABLE projects ADD COLUMN milestones_json TEXT",
                )

                # 4. AI 与系统上下文
                add_column_if_missing(
                    "system_context_prompt",
                    "ALTER TABLE projects ADD COLUMN system_context_prompt TEXT",
                )

                conn.commit()

        except Exception as e:
            # 迁移失败不应阻止服务启动，但需要记录错误
            logger.error(f"projects 表结构迁移失败: {e}")

    @contextmanager
    def get_session(self):
        """获取数据库会话上下文管理器"""
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
