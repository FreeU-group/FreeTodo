"""日记表迁移/初始化脚本

运行此脚本可在现有数据库上创建 journals 与 journal_tag_relations 表，并补充相关索引。
"""

from typing import Any, cast

from storage.database_base import DatabaseBase
from storage.models import (
    Journal,
    JournalActivityRelation,
    JournalTagRelation,
    JournalTodoRelation,
)
from util.logging_config import get_logger

logger = get_logger()


def migrate():
    """创建缺失表并刷新性能索引"""
    db_base = DatabaseBase()
    if db_base.engine is None:
        raise RuntimeError("Database engine is not initialized.")

    with db_base.engine.begin() as conn:
        cast("Any", Journal).__table__.create(bind=conn, checkfirst=True)
        cast("Any", JournalTagRelation).__table__.create(bind=conn, checkfirst=True)
        cast("Any", JournalTodoRelation).__table__.create(bind=conn, checkfirst=True)
        cast("Any", JournalActivityRelation).__table__.create(bind=conn, checkfirst=True)
        logger.info("journals 相关表检查/创建完成")

    # 补充索引
    db_base._create_performance_indexes()
    logger.info("journals 相关索引检查/创建完成")


if __name__ == "__main__":
    migrate()
