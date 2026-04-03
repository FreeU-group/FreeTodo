"""add todo who_founder who_executor

Revision ID: add_todo_who_001
Revises: add_speaker_is_me_001
Create Date: 2026-03-18 00:00:00.000000

为 todos 表添加 who_founder（谁发起）和 who_executor（谁去做）字段，
用于存储意图识别提取的 4W 信息。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_todo_who_001"
down_revision: str | Sequence[str] | None = "add_speaker_is_me_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "who_founder" not in columns:
        op.add_column(
            "todos",
            sa.Column("who_founder", sa.String(length=100), nullable=True),
        )
    if "who_executor" not in columns:
        op.add_column(
            "todos",
            sa.Column("who_executor", sa.String(length=100), nullable=True),
        )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    if "who_founder" in columns:
        op.drop_column("todos", "who_founder")
    if "who_executor" in columns:
        op.drop_column("todos", "who_executor")
