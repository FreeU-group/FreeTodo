"""add_context_to_chats

Revision ID: 4ca5036ec7c8
Revises: cc25001eb19c
Create Date: 2025-12-20 14:59:34.383642

为 chats 表添加 context 字段，用于存储会话上下文（JSON 格式）。
这将会话管理从内存迁移到数据库。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4ca5036ec7c8"
down_revision: str | None = "cc25001eb19c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """添加 context 字段到 chats 表"""
    # 检查列是否已存在（防止重复添加）
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns("chats")]

    if "context" not in columns:
        with op.batch_alter_table("chats", schema=None) as batch_op:
            batch_op.add_column(sa.Column("context", sa.Text(), nullable=True))


def downgrade() -> None:
    """移除 context 字段"""
    with op.batch_alter_table("chats", schema=None) as batch_op:
        batch_op.drop_column("context")
