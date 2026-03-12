"""add_todo_timezone_all_day_001

Revision ID: add_todo_timezone_all_day_001
Revises: merge_heads_todos_20260131
Create Date: 2026-02-03 05:30:00.000000

为 todos 表添加 time_zone 与 is_all_day 字段。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_todo_timezone_all_day_001"
down_revision: str | Sequence[str] | None = "merge_heads_todos_20260131"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "time_zone" not in columns:
        op.add_column("todos", sa.Column("time_zone", sa.String(length=64), nullable=True))
    if "is_all_day" not in columns:
        op.add_column(
            "todos",
            sa.Column("is_all_day", sa.Boolean(), nullable=True, server_default=sa.text("0")),
        )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "is_all_day" in columns:
        op.drop_column("todos", "is_all_day")
    if "time_zone" in columns:
        op.drop_column("todos", "time_zone")
