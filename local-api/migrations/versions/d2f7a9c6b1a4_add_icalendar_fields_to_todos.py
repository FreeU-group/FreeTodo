"""add_icalendar_fields_to_todos

Revision ID: d2f7a9c6b1a4
Revises: add_text_hash_to_ocr_results
Create Date: 2026-01-29 23:30:00.000000

为 todos 表添加 iCalendar 相关字段，并回填已有数据。
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "d2f7a9c6b1a4"
down_revision: str | None = "add_text_hash_to_ocr_results"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_missing_todo_columns(columns: set[str]) -> None:
    with op.batch_alter_table("todos", schema=None) as batch_op:
        column_defs = {
            "uid": sa.Column("uid", sa.String(length=64), nullable=True),
            "completed_at": sa.Column("completed_at", sa.DateTime(), nullable=True),
            "percent_complete": sa.Column("percent_complete", sa.Integer(), nullable=True),
            "rrule": sa.Column("rrule", sa.String(length=500), nullable=True),
        }
        for name, column_def in column_defs.items():
            if name not in columns:
                batch_op.add_column(column_def)


def _ensure_todo_uid_index(inspector: sa.Inspector) -> None:
    indexes = {idx["name"] for idx in inspector.get_indexes("todos")}
    if "idx_todos_uid" not in indexes:
        op.create_index("idx_todos_uid", "todos", ["uid"], unique=False)


def _build_todo_updates(row: dict[str, object]) -> dict[str, object]:
    updates: dict[str, object] = {}

    uid = row.get("uid")
    if not uid:
        updates["uid"] = str(uuid4())

    percent_complete = row.get("percent_complete")
    if percent_complete is None:
        updates["percent_complete"] = 100 if row.get("status") == "completed" else 0

    if row.get("status") == "completed" and row.get("completed_at") is None:
        fallback = row.get("updated_at") or row.get("created_at")
        if isinstance(fallback, datetime):
            updates["completed_at"] = fallback

    return updates


def _backfill_todo_ical_fields(connection: sa.Connection) -> None:
    result = connection.execute(
        sa.text(
            "SELECT id, uid, status, completed_at, percent_complete, updated_at, created_at FROM todos"
        )
    )
    rows = result.mappings().all()

    for row in rows:
        updates = _build_todo_updates(dict(row))
        if not updates:
            continue

        updates["id"] = row["id"]
        sets = ", ".join([f"{key} = :{key}" for key in updates if key != "id"])
        connection.execute(
            sa.text(f"UPDATE todos SET {sets} WHERE id = :id"),  # nosec B608
            updates,
        )


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    columns = {col["name"] for col in inspector.get_columns("todos")}
    _add_missing_todo_columns(columns)
    _ensure_todo_uid_index(inspector)
    _backfill_todo_ical_fields(connection)


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    indexes = {idx["name"] for idx in inspector.get_indexes("todos")}
    if "idx_todos_uid" in indexes:
        op.drop_index("idx_todos_uid", table_name="todos")

    columns = {col["name"] for col in inspector.get_columns("todos")}
    with op.batch_alter_table("todos", schema=None) as batch_op:
        if "rrule" in columns:
            batch_op.drop_column("rrule")
        if "percent_complete" in columns:
            batch_op.drop_column("percent_complete")
        if "completed_at" in columns:
            batch_op.drop_column("completed_at")
        if "uid" in columns:
            batch_op.drop_column("uid")
