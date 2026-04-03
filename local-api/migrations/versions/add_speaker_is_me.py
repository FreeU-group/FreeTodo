"""add speaker_profiles.is_me column

Revision ID: add_speaker_is_me_001
Revises: add_speaker_001
Create Date: 2026-03-16 00:00:00.000000

允许将某个说话人标记为"我"，用于区分用户自己的声纹。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_speaker_is_me_001"
down_revision: str | None = "add_speaker_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "speaker_profiles" in existing_tables:
        existing_columns = [c["name"] for c in inspector.get_columns("speaker_profiles")]
        if "is_me" not in existing_columns:
            op.add_column(
                "speaker_profiles",
                sa.Column("is_me", sa.Boolean(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()

    if "speaker_profiles" in existing_tables:
        existing_columns = [c["name"] for c in inspector.get_columns("speaker_profiles")]
        if "is_me" in existing_columns:
            op.drop_column("speaker_profiles", "is_me")
