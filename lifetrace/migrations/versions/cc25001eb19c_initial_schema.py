"""initial_schema

Revision ID: cc25001eb19c
Revises:
Create Date: 2025-12-20 14:58:03.694426

这是一个基线迁移，用于标记现有数据库结构。
对于已存在的数据库，此迁移不执行任何操作。
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "cc25001eb19c"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """基线迁移 - 不执行任何操作

    现有数据库的表结构已经正确，此迁移仅用于建立 Alembic 版本基线。
    新数据库的表结构由 SQLModel.metadata.create_all() 创建。
    """
    pass


def downgrade() -> None:
    """基线迁移 - 不执行任何操作"""
    pass
