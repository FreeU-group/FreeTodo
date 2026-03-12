"""add_icalendar_fields_v2_001

Revision ID: add_icalendar_fields_v2_001
Revises: add_todo_timezone_all_day_001
Create Date: 2026-02-06 00:00:00.000000

为 todos 表补齐 iCalendar 相关字段，并回填旧字段映射。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "add_icalendar_fields_v2_001"
down_revision: str | Sequence[str] | None = "add_todo_timezone_all_day_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_missing_todo_columns(columns: set[str]) -> None:
    column_defs = {
        "item_type": sa.Column("item_type", sa.String(length=10), nullable=True),
        "summary": sa.Column("summary", sa.String(length=200), nullable=True),
        "location": sa.Column("location", sa.String(length=200), nullable=True),
        "categories": sa.Column("categories", sa.Text(), nullable=True),
        "classification": sa.Column("classification", sa.String(length=20), nullable=True),
        "dtstart": sa.Column("dtstart", sa.DateTime(), nullable=True),
        "dtend": sa.Column("dtend", sa.DateTime(), nullable=True),
        "due": sa.Column("due", sa.DateTime(), nullable=True),
        "duration": sa.Column("duration", sa.String(length=64), nullable=True),
        "tzid": sa.Column("tzid", sa.String(length=64), nullable=True),
        "dtstamp": sa.Column("dtstamp", sa.DateTime(), nullable=True),
        "created": sa.Column("created", sa.DateTime(), nullable=True),
        "last_modified": sa.Column("last_modified", sa.DateTime(), nullable=True),
        "sequence": sa.Column("sequence", sa.Integer(), nullable=True),
        "rdate": sa.Column("rdate", sa.Text(), nullable=True),
        "exdate": sa.Column("exdate", sa.Text(), nullable=True),
        "recurrence_id": sa.Column("recurrence_id", sa.DateTime(), nullable=True),
        "related_to_uid": sa.Column("related_to_uid", sa.String(length=64), nullable=True),
        "related_to_reltype": sa.Column("related_to_reltype", sa.String(length=20), nullable=True),
        "ical_status": sa.Column("ical_status", sa.String(length=20), nullable=True),
    }

    with op.batch_alter_table("todos", schema=None) as batch_op:
        for name, column_def in column_defs.items():
            if name not in columns:
                batch_op.add_column(column_def)


def _backfill_todo_ical_fields(connection: sa.Connection) -> None:
    updates = [
        "UPDATE todos SET item_type = 'VTODO' WHERE item_type IS NULL",
        "UPDATE todos SET summary = name WHERE summary IS NULL AND name IS NOT NULL",
        "UPDATE todos SET dtstart = start_time WHERE dtstart IS NULL AND start_time IS NOT NULL",
        "UPDATE todos SET dtend = end_time WHERE dtend IS NULL AND end_time IS NOT NULL",
        "UPDATE todos SET due = deadline WHERE due IS NULL AND deadline IS NOT NULL",
        "UPDATE todos SET tzid = time_zone WHERE tzid IS NULL AND time_zone IS NOT NULL",
        "UPDATE todos SET created = created_at WHERE created IS NULL AND created_at IS NOT NULL",
        "UPDATE todos SET last_modified = updated_at "
        "WHERE last_modified IS NULL AND updated_at IS NOT NULL",
        "UPDATE todos SET dtstamp = updated_at WHERE dtstamp IS NULL AND updated_at IS NOT NULL",
        "UPDATE todos SET sequence = 0 WHERE sequence IS NULL",
        "UPDATE todos SET ical_status = CASE status "
        "WHEN 'completed' THEN 'COMPLETED' "
        "WHEN 'canceled' THEN 'CANCELLED' "
        "WHEN 'draft' THEN 'NEEDS-ACTION' "
        "ELSE 'NEEDS-ACTION' "
        "END "
        "WHERE ical_status IS NULL AND status IS NOT NULL",
    ]

    for stmt in updates:
        connection.execute(sa.text(stmt))


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    _add_missing_todo_columns(columns)
    _backfill_todo_ical_fields(connection)


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "todos" not in existing_tables:
        return

    columns = {col["name"] for col in inspector.get_columns("todos")}
    drop_columns = [
        "ical_status",
        "related_to_reltype",
        "related_to_uid",
        "recurrence_id",
        "exdate",
        "rdate",
        "sequence",
        "last_modified",
        "created",
        "dtstamp",
        "tzid",
        "duration",
        "due",
        "dtend",
        "dtstart",
        "classification",
        "categories",
        "location",
        "summary",
        "item_type",
    ]
    with op.batch_alter_table("todos", schema=None) as batch_op:
        for name in drop_columns:
            if name in columns:
                batch_op.drop_column(name)
