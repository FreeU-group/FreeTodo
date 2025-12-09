"""日记表迁移/初始化脚本

运行此脚本可在现有数据库上创建 journals 与 journal_tag_relations 表，并补充相关索引。
"""

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import Journal, JournalTagRelation
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def migrate():
    """创建缺失表并刷新性能索引"""
    db_base = DatabaseBase()

    with db_base.engine.begin() as conn:
        Journal.__table__.create(bind=conn, checkfirst=True)
        JournalTagRelation.__table__.create(bind=conn, checkfirst=True)
        logger.info("journals 相关表检查/创建完成")

    # 补充索引
    db_base._create_performance_indexes()
    logger.info("journals 相关索引检查/创建完成")


if __name__ == "__main__":
    migrate()
