"""add_optimized_extraction_fields

Revision ID: add_optimized_extraction_001
Revises: add_file_path_001
Create Date: 2026-01-22 10:00:00.000000

添加优化文本的提取字段到 transcriptions 表
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_optimized_extraction_001"
down_revision: str = "add_file_path_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加优化文本的提取字段到 transcriptions 表"""
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "transcriptions" not in existing_tables:
        # 如果表不存在，跳过（可能在其他迁移中创建）
        return

    # 检查列是否已存在
    existing_columns = [col["name"] for col in inspector.get_columns("transcriptions")]

    # 添加 extracted_todos_optimized 字段
    if "extracted_todos_optimized" not in existing_columns:
        op.add_column(
            "transcriptions",
            sa.Column("extracted_todos_optimized", sa.Text(), nullable=True),
        )

    # 添加 extracted_schedules_optimized 字段
    if "extracted_schedules_optimized" not in existing_columns:
        op.add_column(
            "transcriptions",
            sa.Column("extracted_schedules_optimized", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    """移除优化文本的提取字段"""
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "transcriptions" not in existing_tables:
        return

    existing_columns = [col["name"] for col in inspector.get_columns("transcriptions")]

    if "extracted_schedules_optimized" in existing_columns:
        op.drop_column("transcriptions", "extracted_schedules_optimized")

    if "extracted_todos_optimized" in existing_columns:
        op.drop_column("transcriptions", "extracted_todos_optimized")
