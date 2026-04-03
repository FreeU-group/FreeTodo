"""add_todo_reminder_offsets_001

Revision ID: add_todo_reminder_offsets_001
Revises: merge_heads_todos_20260131
Create Date: 2026-02-01

Add reminder_offsets column to todos table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_todo_reminder_offsets_001"
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
    if "reminder_offsets" not in columns:
        op.add_column("todos", sa.Column("reminder_offsets", sa.Text(), nullable=True))


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "reminder_offsets" in columns:
        op.drop_column("todos", "reminder_offsets")
