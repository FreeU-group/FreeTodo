"""add_journal_panel_001

Revision ID: add_journal_panel_001
Revises: merge_heads_todos_20260131
Create Date: 2026-02-03 03:05:00.000000

Extend journals table for journal panel and add relation tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_journal_panel_001"
down_revision: str | Sequence[str] | None = "merge_heads_todos_20260131"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_column_if_missing(table: str, column: sa.Column, columns: set[str]) -> None:
    if column.name not in columns:
        op.add_column(table, column)


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "journals" in existing_tables:
        columns = {col["name"] for col in inspector.get_columns("journals")}
        _add_column_if_missing(
            "journals",
            sa.Column("content_objective", sa.Text(), nullable=True),
            columns,
        )
        _add_column_if_missing(
            "journals",
            sa.Column("content_ai", sa.Text(), nullable=True),
            columns,
        )
        _add_column_if_missing(
            "journals",
            sa.Column("mood", sa.String(length=50), nullable=True),
            columns,
        )
        _add_column_if_missing(
            "journals",
            sa.Column("energy", sa.Integer(), nullable=True),
            columns,
        )
        _add_column_if_missing(
            "journals",
            sa.Column("day_bucket_start", sa.DateTime(), nullable=True),
            columns,
        )

    if "journal_todo_relations" not in existing_tables:
        op.create_table(
            "journal_todo_relations",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("journal_id", sa.Integer(), nullable=False),
            sa.Column("todo_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )

    if "journal_activity_relations" not in existing_tables:
        op.create_table(
            "journal_activity_relations",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("journal_id", sa.Integer(), nullable=False),
            sa.Column("activity_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "journal_activity_relations" in existing_tables:
        op.drop_table("journal_activity_relations")

    if "journal_todo_relations" in existing_tables:
        op.drop_table("journal_todo_relations")

    if "journals" in existing_tables:
        columns = {col["name"] for col in inspector.get_columns("journals")}
        with op.batch_alter_table("journals", schema=None) as batch_op:
            if "day_bucket_start" in columns:
                batch_op.drop_column("day_bucket_start")
            if "energy" in columns:
                batch_op.drop_column("energy")
            if "mood" in columns:
                batch_op.drop_column("mood")
            if "content_ai" in columns:
                batch_op.drop_column("content_ai")
            if "content_objective" in columns:
                batch_op.drop_column("content_objective")
