"""数据库基础管理器 - 负责数据库初始化和会话管理

使用 SQLModel 进行数据库管理，迁移由 Alembic 处理。
"""

import os
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, SQLModel

from util.logging_config import get_logger
from util.path_utils import get_database_path
from util.utils import ensure_dir

logger = get_logger()

try:
    from alembic import command
    from alembic.config import Config
except Exception:
    command = None
    Config = None


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

            # 创建表
            # 对于新数据库：创建所有表
            # 对于现有数据库：只创建缺失的表（SQLModel.metadata.create_all 会自动跳过已存在的表）
            if not db_exists:
                SQLModel.metadata.create_all(bind=self.engine)
                logger.info(f"数据库初始化完成: {db_path}")
            else:
                # 对于现有数据库，也调用 create_all 来创建缺失的表
                # checkfirst=True（默认值）会跳过已存在的表
                SQLModel.metadata.create_all(bind=self.engine)

            # 运行 Alembic 迁移，补齐已有数据库的新增列/索引
            self._run_migrations()
            self._ensure_legacy_schema_compatibility()

            # 初始化用户系统默认数据
            self._init_user_data()

            # 性能优化：添加关键索引
            self._create_performance_indexes()

        except Exception as e:
            logger.error(f"数据库初始化失败: {e}")
            raise

    def _run_migrations(self) -> None:
        """运行 Alembic 迁移（如可用）"""
        if command is None or Config is None:
            logger.warning("Alembic 未就绪，跳过迁移")
            return

        alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
        migrations_dir = alembic_ini.parent / "migrations"

        if not alembic_ini.exists() or not migrations_dir.exists():
            logger.warning("Alembic 配置缺失，跳过迁移")
            return

        config = Config(str(alembic_ini))
        config.set_main_option("script_location", str(migrations_dir))
        config.set_main_option("sqlalchemy.url", f"sqlite:///{get_database_path()}")

        try:
            command.upgrade(config, "head")
            logger.info("数据库迁移检查完成")
        except Exception as exc:
            logger.error(f"数据库迁移失败: {exc}")
            raise

    def _ensure_legacy_schema_compatibility(self) -> None:  # noqa: C901, PLR0912
        """Repair known schema drift in legacy SQLite databases."""
        if self.engine is None:
            return

        with self.engine.connect() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                ).fetchall()
            }
            if "todos" not in tables:
                return

            todo_columns = {
                row[1] for row in conn.execute(text("PRAGMA table_info(todos)")).fetchall()
            }
            # Keep this list additive and SQLite-safe. We intentionally avoid
            # constraints in ALTER TABLE ADD COLUMN for maximum compatibility.
            compat_columns: dict[str, str] = {
                "description": "ALTER TABLE todos ADD COLUMN description TEXT",
                "deadline": "ALTER TABLE todos ADD COLUMN deadline DATETIME",
                "start_time": "ALTER TABLE todos ADD COLUMN start_time DATETIME",
                "end_time": "ALTER TABLE todos ADD COLUMN end_time DATETIME",
                "time_zone": "ALTER TABLE todos ADD COLUMN time_zone VARCHAR(64)",
                "uid": "ALTER TABLE todos ADD COLUMN uid VARCHAR(64)",
                "summary": "ALTER TABLE todos ADD COLUMN summary VARCHAR(200)",
                "user_notes": "ALTER TABLE todos ADD COLUMN user_notes TEXT",
                "parent_todo_id": "ALTER TABLE todos ADD COLUMN parent_todo_id INTEGER",
                "item_type": "ALTER TABLE todos ADD COLUMN item_type VARCHAR(10)",
                "location": "ALTER TABLE todos ADD COLUMN location VARCHAR(200)",
                "categories": "ALTER TABLE todos ADD COLUMN categories TEXT",
                "classification": "ALTER TABLE todos ADD COLUMN classification VARCHAR(20)",
                "dtstart": "ALTER TABLE todos ADD COLUMN dtstart DATETIME",
                "dtend": "ALTER TABLE todos ADD COLUMN dtend DATETIME",
                "due": "ALTER TABLE todos ADD COLUMN due DATETIME",
                "duration": "ALTER TABLE todos ADD COLUMN duration VARCHAR(64)",
                "tzid": "ALTER TABLE todos ADD COLUMN tzid VARCHAR(64)",
                "is_all_day": "ALTER TABLE todos ADD COLUMN is_all_day BOOLEAN",
                "dtstamp": "ALTER TABLE todos ADD COLUMN dtstamp DATETIME",
                "created": "ALTER TABLE todos ADD COLUMN created DATETIME",
                "last_modified": "ALTER TABLE todos ADD COLUMN last_modified DATETIME",
                "sequence": "ALTER TABLE todos ADD COLUMN sequence INTEGER",
                "rdate": "ALTER TABLE todos ADD COLUMN rdate TEXT",
                "exdate": "ALTER TABLE todos ADD COLUMN exdate TEXT",
                "recurrence_id": "ALTER TABLE todos ADD COLUMN recurrence_id DATETIME",
                "related_to_uid": "ALTER TABLE todos ADD COLUMN related_to_uid VARCHAR(64)",
                "related_to_reltype": "ALTER TABLE todos ADD COLUMN related_to_reltype VARCHAR(20)",
                "ical_status": "ALTER TABLE todos ADD COLUMN ical_status VARCHAR(20)",
                "reminder_offsets": "ALTER TABLE todos ADD COLUMN reminder_offsets TEXT",
                "status": "ALTER TABLE todos ADD COLUMN status VARCHAR(20)",
                "priority": "ALTER TABLE todos ADD COLUMN priority VARCHAR(20)",
                "completed_at": "ALTER TABLE todos ADD COLUMN completed_at DATETIME",
                "percent_complete": "ALTER TABLE todos ADD COLUMN percent_complete INTEGER",
                "rrule": "ALTER TABLE todos ADD COLUMN rrule VARCHAR(500)",
                "order": 'ALTER TABLE todos ADD COLUMN "order" INTEGER',
                "related_activities": "ALTER TABLE todos ADD COLUMN related_activities TEXT",
            }

            added_columns: list[str] = []
            for col, ddl in compat_columns.items():
                if col in todo_columns:
                    continue
                logger.warning(
                    f"Detected legacy todos schema without {col}, applying compatibility fix"
                )
                conn.execute(text(ddl))
                added_columns.append(col)

            repaired_uid_rows = 0
            if "uid" in added_columns:
                todo_ids = conn.execute(
                    text("SELECT id FROM todos WHERE uid IS NULL OR uid = ''")
                ).fetchall()
                repaired_uid_rows = len(todo_ids)
                for (todo_id,) in todo_ids:
                    conn.execute(
                        text("UPDATE todos SET uid = :uid WHERE id = :id"),
                        {"uid": str(uuid4()), "id": todo_id},
                    )
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_todos_uid ON todos(uid)"))

            # Backfill summary for legacy rows.
            if "summary" in added_columns:
                conn.execute(
                    text(
                        "UPDATE todos SET summary = name WHERE summary IS NULL AND name IS NOT NULL"
                    )
                )

            # Reasonable defaults for new numeric/boolean columns.
            if "sequence" in added_columns:
                conn.execute(text("UPDATE todos SET sequence = 0 WHERE sequence IS NULL"))
            if "percent_complete" in added_columns:
                conn.execute(
                    text("UPDATE todos SET percent_complete = 0 WHERE percent_complete IS NULL")
                )
            if "is_all_day" in added_columns:
                conn.execute(text("UPDATE todos SET is_all_day = 0 WHERE is_all_day IS NULL"))
            if "item_type" in added_columns:
                conn.execute(
                    text(
                        "UPDATE todos SET item_type = 'VTODO' WHERE item_type IS NULL OR item_type = ''"
                    )
                )
            if "status" in added_columns:
                conn.execute(
                    text("UPDATE todos SET status = 'active' WHERE status IS NULL OR status = ''")
                )
            if "priority" in added_columns:
                conn.execute(
                    text(
                        "UPDATE todos SET priority = 'none' WHERE priority IS NULL OR priority = ''"
                    )
                )
            if "order" in added_columns:
                conn.execute(text('UPDATE todos SET "order" = 0 WHERE "order" IS NULL'))

            if added_columns:
                conn.commit()
                logger.info(
                    f"Legacy todos schema repaired: added={added_columns}, repaired_uid_rows={repaired_uid_rows}"
                )

    def _get_profile_user_info(self) -> tuple[str, str]:
        """获取当前 Profile 对应的默认用户 ID 和名称"""
        try:
            from services.profile_service import get_active_profile  # noqa: PLC0415

            profile = get_active_profile()
            if profile:
                return profile.id, profile.name
        except Exception:
            pass
        return "local-default-user", "本地用户"

    def _init_user_data(self) -> None:
        """初始化用户系统默认数据（本地默认用户 + 会员计划）"""
        try:
            from storage.models import AuthMode, User, UserType  # noqa: PLC0415

            user_id, username = self._get_profile_user_info()

            with Session(self.engine) as session:
                local_user = session.get(User, user_id)
                if not local_user:
                    local_user = User(
                        id=user_id,
                        username=username,
                        user_type=UserType.ADMIN,
                        auth_mode=AuthMode.LOCAL,
                    )
                    session.add(local_user)
                    session.commit()
                    logger.info("本地默认用户已创建: id=%s", user_id)

            with Session(self.engine) as session:
                from services.membership_service import (  # noqa: PLC0415
                    create_free_membership,
                    init_default_plans,
                )

                init_default_plans(session)
                create_free_membership(session, user_id)
        except Exception as e:
            logger.warning("用户系统初始化跳过: %s", e)

    def _create_performance_indexes(self):
        """创建性能优化索引"""
        try:
            if self.engine is None:
                raise RuntimeError("Database engine is not initialized.")
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

                # 获取所有表的列信息，用于检查列是否存在
                table_columns: dict[str, set[str]] = {}
                tables = conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                ).fetchall()
                for (table_name,) in tables:
                    columns = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
                    table_columns[table_name] = {col[1] for col in columns}

                # 定义需要创建的索引
                # 格式：(索引名, 表名, 列名列表, 创建SQL)
                indexes_to_create = [
                    (
                        "idx_ocr_results_screenshot_id",
                        "ocr_results",
                        ["screenshot_id"],
                        "CREATE INDEX IF NOT EXISTS idx_ocr_results_screenshot_id ON ocr_results(screenshot_id)",
                    ),
                    (
                        "idx_screenshots_created_at",
                        "screenshots",
                        ["created_at"],
                        "CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at)",
                    ),
                    (
                        "idx_screenshots_app_name",
                        "screenshots",
                        ["app_name"],
                        "CREATE INDEX IF NOT EXISTS idx_screenshots_app_name ON screenshots(app_name)",
                    ),
                    (
                        "idx_screenshots_event_id",
                        "screenshots",
                        ["event_id"],
                        "CREATE INDEX IF NOT EXISTS idx_screenshots_event_id ON screenshots(event_id)",
                    ),
                    (
                        "idx_todos_parent_todo_id",
                        "todos",
                        ["parent_todo_id"],
                        "CREATE INDEX IF NOT EXISTS idx_todos_parent_todo_id ON todos(parent_todo_id)",
                    ),
                    (
                        "idx_todos_status",
                        "todos",
                        ["status"],
                        "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)",
                    ),
                    (
                        "idx_todos_deleted_at",
                        "todos",
                        ["deleted_at"],
                        "CREATE INDEX IF NOT EXISTS idx_todos_deleted_at ON todos(deleted_at)",
                    ),
                    (
                        "idx_todos_priority",
                        "todos",
                        ["priority"],
                        "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)",
                    ),
                    (
                        "idx_todos_uid",
                        "todos",
                        ["uid"],
                        "CREATE INDEX IF NOT EXISTS idx_todos_uid ON todos(uid)",
                    ),
                    (
                        "idx_todos_order",
                        "todos",
                        ["order"],
                        'CREATE INDEX IF NOT EXISTS idx_todos_order ON todos("order")',
                    ),
                    (
                        "idx_attachments_file_hash",
                        "attachments",
                        ["file_hash"],
                        "CREATE INDEX IF NOT EXISTS idx_attachments_file_hash ON attachments(file_hash)",
                    ),
                    (
                        "idx_attachments_deleted_at",
                        "attachments",
                        ["deleted_at"],
                        "CREATE INDEX IF NOT EXISTS idx_attachments_deleted_at ON attachments(deleted_at)",
                    ),
                    (
                        "idx_todo_attachment_relations_todo_id",
                        "todo_attachment_relations",
                        ["todo_id"],
                        "CREATE INDEX IF NOT EXISTS idx_todo_attachment_relations_todo_id ON todo_attachment_relations(todo_id)",
                    ),
                    (
                        "idx_todo_attachment_relations_attachment_id",
                        "todo_attachment_relations",
                        ["attachment_id"],
                        "CREATE INDEX IF NOT EXISTS idx_todo_attachment_relations_attachment_id ON todo_attachment_relations(attachment_id)",
                    ),
                    (
                        "idx_tags_tag_name_unique",
                        "tags",
                        ["tag_name"],
                        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_tag_name_unique ON tags(tag_name)",
                    ),
                    (
                        "idx_tags_deleted_at",
                        "tags",
                        ["deleted_at"],
                        "CREATE INDEX IF NOT EXISTS idx_tags_deleted_at ON tags(deleted_at)",
                    ),
                    (
                        "idx_todo_tag_relations_todo_id",
                        "todo_tag_relations",
                        ["todo_id"],
                        "CREATE INDEX IF NOT EXISTS idx_todo_tag_relations_todo_id ON todo_tag_relations(todo_id)",
                    ),
                    (
                        "idx_todo_tag_relations_tag_id",
                        "todo_tag_relations",
                        ["tag_id"],
                        "CREATE INDEX IF NOT EXISTS idx_todo_tag_relations_tag_id ON todo_tag_relations(tag_id)",
                    ),
                    (
                        "idx_journals_date",
                        "journals",
                        ["date"],
                        "CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(date)",
                    ),
                    (
                        "idx_journals_deleted_at",
                        "journals",
                        ["deleted_at"],
                        "CREATE INDEX IF NOT EXISTS idx_journals_deleted_at ON journals(deleted_at)",
                    ),
                    (
                        "idx_journals_uid",
                        "journals",
                        ["uid"],
                        "CREATE INDEX IF NOT EXISTS idx_journals_uid ON journals(uid)",
                    ),
                    (
                        "idx_journal_tag_relations_journal_id",
                        "journal_tag_relations",
                        ["journal_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_tag_relations_journal_id ON journal_tag_relations(journal_id)",
                    ),
                    (
                        "idx_journal_tag_relations_tag_id",
                        "journal_tag_relations",
                        ["tag_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_tag_relations_tag_id ON journal_tag_relations(tag_id)",
                    ),
                    (
                        "idx_journal_todo_relations_journal_id",
                        "journal_todo_relations",
                        ["journal_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_todo_relations_journal_id ON journal_todo_relations(journal_id)",
                    ),
                    (
                        "idx_journal_todo_relations_todo_id",
                        "journal_todo_relations",
                        ["todo_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_todo_relations_todo_id ON journal_todo_relations(todo_id)",
                    ),
                    (
                        "idx_journal_activity_relations_journal_id",
                        "journal_activity_relations",
                        ["journal_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_activity_relations_journal_id ON journal_activity_relations(journal_id)",
                    ),
                    (
                        "idx_journal_activity_relations_activity_id",
                        "journal_activity_relations",
                        ["activity_id"],
                        "CREATE INDEX IF NOT EXISTS idx_journal_activity_relations_activity_id ON journal_activity_relations(activity_id)",
                    ),
                    (
                        "idx_activities_start_time",
                        "activities",
                        ["start_time"],
                        "CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities(start_time)",
                    ),
                    (
                        "idx_activities_end_time",
                        "activities",
                        ["end_time"],
                        "CREATE INDEX IF NOT EXISTS idx_activities_end_time ON activities(end_time)",
                    ),
                    (
                        "idx_activity_event_relations_activity_id",
                        "activity_event_relations",
                        ["activity_id"],
                        "CREATE INDEX IF NOT EXISTS idx_activity_event_relations_activity_id ON activity_event_relations(activity_id)",
                    ),
                    (
                        "idx_activity_event_relations_event_id",
                        "activity_event_relations",
                        ["event_id"],
                        "CREATE INDEX IF NOT EXISTS idx_activity_event_relations_event_id ON activity_event_relations(event_id)",
                    ),
                    (
                        "idx_chats_session_id",
                        "chats",
                        ["session_id"],
                        "CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id)",
                    ),
                    (
                        "idx_messages_chat_id",
                        "messages",
                        ["chat_id"],
                        "CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)",
                    ),
                    # 音频相关索引
                    (
                        "idx_audio_recordings_start_time",
                        "audio_recordings",
                        ["start_time"],
                        "CREATE INDEX IF NOT EXISTS idx_audio_recordings_start_time ON audio_recordings(start_time)",
                    ),
                    (
                        "idx_audio_recordings_status",
                        "audio_recordings",
                        ["status"],
                        "CREATE INDEX IF NOT EXISTS idx_audio_recordings_status ON audio_recordings(status)",
                    ),
                    (
                        "idx_audio_recordings_deleted_at",
                        "audio_recordings",
                        ["deleted_at"],
                        "CREATE INDEX IF NOT EXISTS idx_audio_recordings_deleted_at ON audio_recordings(deleted_at)",
                    ),
                    (
                        "idx_transcriptions_audio_recording_id",
                        "transcriptions",
                        ["audio_recording_id"],
                        "CREATE INDEX IF NOT EXISTS idx_transcriptions_audio_recording_id ON transcriptions(audio_recording_id)",
                    ),
                    (
                        "idx_transcriptions_extraction_status",
                        "transcriptions",
                        ["extraction_status"],
                        "CREATE INDEX IF NOT EXISTS idx_transcriptions_extraction_status ON transcriptions(extraction_status)",
                    ),
                ]

                # 创建索引
                created_count = 0
                skipped_count = 0
                for index_name, table_name, columns, create_sql in indexes_to_create:
                    # 检查索引是否已存在
                    if index_name in existing_indexes:
                        continue

                    # 检查表是否存在
                    if table_name not in table_columns:
                        skipped_count += 1
                        logger.debug(f"跳过索引 {index_name}：表 {table_name} 不存在")
                        continue

                    # 检查所有需要的列是否存在
                    missing_columns = [
                        col for col in columns if col not in table_columns[table_name]
                    ]
                    if missing_columns:
                        skipped_count += 1
                        logger.debug(
                            f"跳过索引 {index_name}：列 {missing_columns} 在表 {table_name} 中不存在"
                        )
                        continue

                    # 创建索引
                    conn.execute(text(create_sql))
                    created_count += 1
                    logger.info(f"已创建性能索引: {index_name}")

                conn.commit()

                # 只在有索引被创建或跳过时打印完成信息
                if created_count > 0 or skipped_count > 0:
                    logger.info(
                        f"性能索引检查完成：创建 {created_count} 个，跳过 {skipped_count} 个（表/列不存在）"
                    )

        except Exception as e:
            logger.warning(f"创建性能索引失败: {e}")
            raise

    def reinitialize(self) -> None:
        """Profile 切换后重新初始化数据库连接"""
        if self.engine is not None:
            self.engine.dispose()
            self.engine = None
            self.SessionLocal = None
        self._init_database()

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
        if self.SessionLocal is None:
            raise RuntimeError("Database session factory is not initialized.")
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
    if db_base.SessionLocal is None:
        raise RuntimeError("Database session factory is not initialized.")
    session = db_base.SessionLocal()
    try:
        yield session
    finally:
        session.close()
