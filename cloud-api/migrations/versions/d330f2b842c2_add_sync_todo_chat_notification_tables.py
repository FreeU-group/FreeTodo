"""add sync todo chat notification tables

Revision ID: d330f2b842c2
Revises: c799bbd0b50a
Create Date: 2026-04-05 20:28:18.446827
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d330f2b842c2"
down_revision: Union[str, None] = "c799bbd0b50a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sync_devices",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("device_name", sa.String(length=200), nullable=True),
        sa.Column("device_type", sa.String(length=20), nullable=False, server_default="desktop"),
        sa.Column("push_token", sa.String(length=500), nullable=True),
        sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_devices_user_id", "sync_devices", ["user_id"])

    op.create_table(
        "sync_changelog",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.String(length=100), nullable=False),
        sa.Column("operation", sa.String(length=10), nullable=False),
        sa.Column("source_device_id", sa.String(length=100), nullable=True),
        sa.Column("snapshot", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_changelog_user_id", "sync_changelog", ["user_id"])
    op.create_index("ix_sync_changelog_entity_id", "sync_changelog", ["entity_id"])

    op.create_table(
        "sync_cursors",
        sa.Column("device_id", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("last_cursor", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("device_id", "entity_type"),
    )

    op.create_table(
        "cloud_todos",
        sa.Column("uid", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("user_notes", sa.Text(), nullable=True),
        sa.Column("who_founder", sa.String(length=100), nullable=True),
        sa.Column("who_executor", sa.String(length=100), nullable=True),
        sa.Column("parent_todo_uid", sa.String(length=64), nullable=True),
        sa.Column("item_type", sa.String(length=10), nullable=False, server_default="VTODO"),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("categories", sa.Text(), nullable=True),
        sa.Column("classification", sa.String(length=20), nullable=True),
        sa.Column("deadline", sa.DateTime(), nullable=True),
        sa.Column("start_time", sa.DateTime(), nullable=True),
        sa.Column("end_time", sa.DateTime(), nullable=True),
        sa.Column("dtstart", sa.DateTime(), nullable=True),
        sa.Column("dtend", sa.DateTime(), nullable=True),
        sa.Column("due", sa.DateTime(), nullable=True),
        sa.Column("duration", sa.String(length=64), nullable=True),
        sa.Column("time_zone", sa.String(length=64), nullable=True),
        sa.Column("tzid", sa.String(length=64), nullable=True),
        sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("dtstamp", sa.DateTime(), nullable=True),
        sa.Column("ical_created", sa.DateTime(), nullable=True),
        sa.Column("last_modified", sa.DateTime(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rdate", sa.Text(), nullable=True),
        sa.Column("exdate", sa.Text(), nullable=True),
        sa.Column("recurrence_id", sa.DateTime(), nullable=True),
        sa.Column("related_to_uid", sa.String(length=64), nullable=True),
        sa.Column("related_to_reltype", sa.String(length=20), nullable=True),
        sa.Column("ical_status", sa.String(length=20), nullable=True),
        sa.Column("reminder_offsets", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("percent_complete", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rrule", sa.String(length=500), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tags", sa.Text(), nullable=True),
        sa.Column("related_activities", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("uid"),
    )
    op.create_index("ix_cloud_todos_user_id", "cloud_todos", ["user_id"])

    op.create_table(
        "cloud_chats",
        sa.Column("session_id", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("chat_type", sa.String(length=50), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("extra_data", sa.Text(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("session_id"),
    )
    op.create_index("ix_cloud_chats_user_id", "cloud_chats", ["user_id"])

    op.create_table(
        "cloud_messages",
        sa.Column("uid", sa.String(length=64), nullable=False),
        sa.Column("chat_session_id", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("extra_data", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("uid"),
    )
    op.create_index("ix_cloud_messages_chat_session_id", "cloud_messages", ["chat_session_id"])
    op.create_index("ix_cloud_messages_user_id", "cloud_messages", ["user_id"])

    op.create_table(
        "cloud_notifications",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("user_id", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(length=30), nullable=True),
        sa.Column("related_todo_uid", sa.String(length=64), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_pushed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("push_channels", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cloud_notifications_user_id", "cloud_notifications", ["user_id"])


def downgrade() -> None:
    op.drop_table("cloud_notifications")
    op.drop_table("cloud_messages")
    op.drop_table("cloud_chats")
    op.drop_table("cloud_todos")
    op.drop_table("sync_cursors")
    op.drop_table("sync_changelog")
    op.drop_table("sync_devices")
