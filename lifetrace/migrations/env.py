"""Alembic 迁移环境配置

配置 Alembic 使用 SQLModel 进行数据库迁移。
"""

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# 导入所有模型以确保 metadata 包含所有表
from lifetrace.storage.models import (  # noqa: F401, E402
    Activity,
    ActivityEventRelation,
    Attachment,
    Chat,
    Event,
    Journal,
    JournalTagRelation,
    Message,
    OCRResult,
    Screenshot,
    Tag,
    Todo,
    TodoAttachmentRelation,
    TodoTagRelation,
    TokenUsage,
)
from lifetrace.util.path_utils import get_database_path  # noqa: E402

# Alembic Config 对象
config = context.config

# 设置 Python 日志
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 使用 SQLModel 的 metadata
target_metadata = SQLModel.metadata


def get_url():
    """获取数据库 URL"""
    return f"sqlite:///{get_database_path()}"


def run_migrations_offline() -> None:
    """在离线模式下运行迁移。

    这将配置上下文仅使用 URL，而不是 Engine，
    虽然这里也可以使用 Engine。通过跳过 Engine 创建，
    我们甚至不需要 DBAPI 可用。

    在这里调用 context.execute() 将会将给定的字符串
    发送到脚本输出。
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite 需要批处理模式
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在在线模式下运行迁移。

    在这种情况下，我们需要创建一个 Engine 并将连接与上下文关联。
    """
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite 需要批处理模式来支持 ALTER TABLE
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
