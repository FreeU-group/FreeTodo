"""add_uid_to_journals

Revision ID: b53d9b7c8e21
Revises: remove_project_task
Create Date: 2026-02-03 12:00:00.000000

为 journals 表添加 iCalendar UID 字段并回填已有数据。
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

if TYPE_CHECKING:
    from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "b53d9b7c8e21"
down_revision: str | None = "merge_heads_journal_todo_20260203"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_missing_journal_columns(columns: set[str]) -> None:
    with op.batch_alter_table("journals", schema=None) as batch_op:
        if "uid" not in columns:
            batch_op.add_column(sa.Column("uid", sa.String(length=64), nullable=True))


def _ensure_journal_uid_index(inspector: sa.Inspector) -> None:
    indexes = {idx["name"] for idx in inspector.get_indexes("journals")}
    if "idx_journals_uid" not in indexes:
        op.create_index("idx_journals_uid", "journals", ["uid"], unique=False)


def _backfill_journal_uids(connection: sa.Connection) -> None:
    result = connection.execute(sa.text("SELECT id, uid FROM journals"))
    rows = result.mappings().all()

    for row in rows:
        uid = row.get("uid")
        if uid:
            continue

        connection.execute(
            sa.text("UPDATE journals SET uid = :uid WHERE id = :id"),  # nosec B608
            {"uid": str(uuid4()), "id": row["id"]},
        )


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    if "journals" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("journals")}
    _add_missing_journal_columns(columns)
    _ensure_journal_uid_index(inspector)
    _backfill_journal_uids(connection)


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    if "journals" not in inspector.get_table_names():
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("journals")}
    if "idx_journals_uid" in indexes:
        op.drop_index("idx_journals_uid", table_name="journals")

    columns = {col["name"] for col in inspector.get_columns("journals")}
    with op.batch_alter_table("journals", schema=None) as batch_op:
        if "uid" in columns:
            batch_op.drop_column("uid")
