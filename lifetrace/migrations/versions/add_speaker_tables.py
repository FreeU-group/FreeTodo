"""add_speaker_tables

Revision ID: add_speaker_001
Revises: merge_automation_ical_001
Create Date: 2026-03-12 00:00:00.000000

添加说话人档案表 (speaker_profiles) 和声纹特征表 (speaker_voiceprints),
以及为 transcriptions 表添加 speaker_segments 字段。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_speaker_001"
down_revision: str | None = "merge_automation_ical_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    # --- speaker_profiles ---
    if "speaker_profiles" not in existing_tables:
        op.create_table(
            "speaker_profiles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )

    # --- speaker_voiceprints ---
    if "speaker_voiceprints" not in existing_tables:
        op.create_table(
            "speaker_voiceprints",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("speaker_profile_id", sa.Integer(), nullable=False, index=True),
            sa.Column("embedding", sa.Text(), nullable=False),
            sa.Column("embedding_dim", sa.Integer(), nullable=False, server_default="192"),
            sa.Column("audio_duration", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("quality_score", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )

    # --- transcriptions.speaker_segments ---
    if "transcriptions" in existing_tables:
        existing_columns = [c["name"] for c in inspector.get_columns("transcriptions")]
        if "speaker_segments" not in existing_columns:
            op.add_column(
                "transcriptions",
                sa.Column("speaker_segments", sa.Text(), nullable=True),
            )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "transcriptions" in existing_tables:
        existing_columns = [c["name"] for c in inspector.get_columns("transcriptions")]
        if "speaker_segments" in existing_columns:
            op.drop_column("transcriptions", "speaker_segments")

    if "speaker_voiceprints" in existing_tables:
        op.drop_table("speaker_voiceprints")

    if "speaker_profiles" in existing_tables:
        op.drop_table("speaker_profiles")
