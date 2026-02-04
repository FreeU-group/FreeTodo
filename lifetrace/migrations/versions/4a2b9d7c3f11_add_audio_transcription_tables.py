"""add_audio_transcription_tables

Revision ID: 4a2b9d7c3f11
Revises: cc25001eb19c
Create Date: 2026-02-02 14:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4a2b9d7c3f11"
down_revision: str | None = "cc25001eb19c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audio_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("file_path", sa.String(length=500), nullable=False, unique=True),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("duration", sa.Float(), nullable=True),
        sa.Column("sample_rate", sa.Integer(), nullable=True),
        sa.Column("channels", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("diarization_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.create_table(
        "audio_segments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("audio_id", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(length=50), nullable=True),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("language", sa.String(length=10), nullable=True),
    )

    op.create_index(
        "idx_audio_records_status",
        "audio_records",
        ["status"],
        unique=False,
    )
    op.create_index(
        "idx_audio_segments_audio_id",
        "audio_segments",
        ["audio_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_audio_segments_audio_id", table_name="audio_segments")
    op.drop_index("idx_audio_records_status", table_name="audio_records")
    op.drop_table("audio_segments")
    op.drop_table("audio_records")
