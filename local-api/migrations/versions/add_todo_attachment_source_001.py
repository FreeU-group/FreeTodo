"""add_todo_attachment_source_001

Revision ID: add_todo_attachment_source_001
Revises: merge_heads_todos_20260131
Create Date: 2026-02-01

为 todo_attachment_relations 表添加 source 字段（user/ai）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_todo_attachment_source_001"
down_revision: str | Sequence[str] | None = "merge_heads_todos_20260131"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todo_attachment_relations" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todo_attachment_relations")}
    if "source" not in columns:
        op.add_column(
            "todo_attachment_relations",
            sa.Column("source", sa.String(length=20), nullable=False, server_default="user"),
        )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todo_attachment_relations" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todo_attachment_relations")}
    if "source" in columns:
        op.drop_column("todo_attachment_relations", "source")
