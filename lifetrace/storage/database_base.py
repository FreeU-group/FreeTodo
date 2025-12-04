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
        """迁移 projects 表结构，保持与最新 ORM 定义一致（SQLite 兼容方式）

        - 将旧字段 system_context_prompt 重命名为 description
        - 删除不再使用的 keywords / whitelist_apps / goal 等列（如存在）
        - 仅在目标列不存在时执行 ALTER TABLE
        """
        try:
            with self.engine.connect() as conn:
                if not self._projects_table_exists(conn):
                    return

                columns = self._get_project_columns(conn)
                columns = self._ensure_project_identity_columns(conn, columns)
                columns = self._rename_or_add_description_column(conn, columns)
                self._drop_legacy_project_columns(conn, columns)

                conn.commit()

        except Exception as e:
            # 迁移失败不应阻止服务启动，但需要记录错误
            logger.error(f"projects 表结构迁移失败: {e}")

    def _projects_table_exists(self, conn) -> bool:
        """检查 projects 表是否存在"""
        tables = [
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
            ).fetchall()
        ]
        return "projects" in tables

    def _get_project_columns(self, conn) -> list[str]:
        """获取 projects 表现有列名列表"""
        column_rows = conn.execute(text("PRAGMA table_info('projects')")).fetchall()
        return [row[1] for row in column_rows]

    def _add_column_if_missing(
        self,
        conn,
        columns: list[str],
        column_name: str,
        ddl: str,
    ) -> list[str]:
        """如果列不存在，则执行 ALTER TABLE 添加"""
        if column_name not in columns:
            conn.execute(text(ddl))
            logger.info(f"已为 projects 表添加列: {column_name}")
            columns.append(column_name)
        return columns

    def _ensure_project_identity_columns(
        self,
        conn,
        columns: list[str],
    ) -> list[str]:
        """确保身份锚点相关列存在"""
        columns = self._add_column_if_missing(
            conn,
            columns,
            "definition_of_done",
            "ALTER TABLE projects ADD COLUMN definition_of_done TEXT",
        )
        columns = self._add_column_if_missing(
            conn,
            columns,
            "status",
            "ALTER TABLE projects ADD COLUMN status VARCHAR(20) DEFAULT 'active'",
        )
        return columns

    def _rename_or_add_description_column(
        self,
        conn,
        columns: list[str],
    ) -> list[str]:
        """处理 description / system_context_prompt 列的兼容迁移"""
        has_description = "description" in columns
        has_system_context = "system_context_prompt" in columns

        if not has_description and has_system_context:
            try:
                conn.execute(
                    text("ALTER TABLE projects RENAME COLUMN system_context_prompt TO description")
                )
                logger.info("已将 projects 表列 system_context_prompt 重命名为 description")
                columns.remove("system_context_prompt")
                columns.append("description")
            except Exception as e:
                logger.error(f"重命名 projects.system_context_prompt 为 description 失败: {e}")
        elif not has_description and not has_system_context:
            columns = self._add_column_if_missing(
                conn,
                columns,
                "description",
                "ALTER TABLE projects ADD COLUMN description TEXT",
            )

        return columns

    def _drop_legacy_project_columns(
        self,
        conn,
        columns: list[str],
    ) -> None:
        """删除不再使用的旧列（如果数据库中仍然存在）"""
        legacy_columns = [
            "keywords",
            "whitelist_apps",
            "keywords_json",
            "whitelist_apps_json",
            "milestones_json",
            "goal",
        ]

        for col in legacy_columns:
            if col not in columns:
                continue
            try:
                conn.execute(text(f"ALTER TABLE projects DROP COLUMN {col}"))
                logger.info(f"已从 projects 表删除废弃列: {col}")
                columns.remove(col)
            except Exception as e:
                logger.warning(
                    f"尝试删除 projects 表列 {col} 失败，可能是 SQLite 版本不支持 DROP COLUMN: {e}"
                )

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
