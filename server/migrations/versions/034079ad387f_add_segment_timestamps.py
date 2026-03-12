"""add_segment_timestamps

Revision ID: 034079ad387f
Revises: 89b2a1f0af8b
Create Date: 2026-01-23 10:00:00.000000

添加 segment_timestamps 字段到 transcriptions 表，用于存储每段文本的精确时间戳
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "034079ad387f"
down_revision: str = "add_file_path_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加 segment_timestamps 字段到 transcriptions 表"""
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "transcriptions" not in existing_tables:
        # 如果表不存在，跳过（可能在其他迁移中创建）
        return

    # 检查列是否已存在
    existing_columns = [col["name"] for col in inspector.get_columns("transcriptions")]

    # 添加 segment_timestamps 字段（JSON 格式，存储每段文本的时间戳数组）
    if "segment_timestamps" not in existing_columns:
        op.add_column(
            "transcriptions",
            sa.Column("segment_timestamps", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    """移除 segment_timestamps 字段"""
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "transcriptions" not in existing_tables:
        return

    existing_columns = [col["name"] for col in inspector.get_columns("transcriptions")]

    if "segment_timestamps" in existing_columns:
        op.drop_column("transcriptions", "segment_timestamps")
