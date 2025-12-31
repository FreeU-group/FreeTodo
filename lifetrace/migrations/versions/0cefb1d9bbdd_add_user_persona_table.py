"""add_user_persona_table

Revision ID: 0cefb1d9bbdd
Revises: 4ca5036ec7c8
Create Date: 2025-12-31 16:56:34.763435

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0cefb1d9bbdd"
down_revision: str | None = "4ca5036ec7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """创建 user_persona 表"""
    op.create_table(
        "user_persona",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nickname", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("last_updated", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """删除 user_persona 表"""
    op.drop_table("user_persona")
