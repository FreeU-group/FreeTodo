"""add_todo_end_time_001

Revision ID: add_todo_end_time_001
Revises: cff6e6d7a3cf
Create Date: 2026-01-30 20:30:00.000000

为 todos 表添加 end_time 字段。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_todo_end_time_001"
down_revision: str | Sequence[str] | None = "cff6e6d7a3cf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "end_time" not in columns:
        op.add_column("todos", sa.Column("end_time", sa.DateTime(), nullable=True))


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "end_time" in columns:
        op.drop_column("todos", "end_time")
