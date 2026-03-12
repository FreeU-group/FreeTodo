"""add_automation_tasks_001

Revision ID: add_automation_tasks_001
Revises: add_todo_attachment_source_001, add_todo_reminder_offsets_001
Create Date: 2026-02-04

Create automation_tasks table for user-defined scheduled tasks.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_automation_tasks_001"
down_revision: str | Sequence[str] | None = (
    "add_todo_attachment_source_001",
    "add_todo_reminder_offsets_001",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "automation_tasks" in existing_tables:
        return

    op.create_table(
        "automation_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("schedule_type", sa.String(length=20), nullable=False),
        sa.Column("schedule_config", sa.Text(), nullable=True),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("action_payload", sa.Text(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sa.String(length=20), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_output", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "automation_tasks" in existing_tables:
        op.drop_table("automation_tasks")
