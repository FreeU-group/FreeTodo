"""merge heads: todos end_time and icalendar fields

Revision ID: merge_heads_todos_20260131
Revises: d2f7a9c6b1a4, add_todo_end_time_001
Create Date: 2026-01-31

合并两个并行 head：
- d2f7a9c6b1a4（todos 的 iCalendar 字段）
- add_todo_end_time_001（todos 的 end_time 字段）

该迁移仅用于合并 revision 图，不包含 schema 变更。
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "merge_heads_todos_20260131"
down_revision: str | Sequence[str] | None = ("d2f7a9c6b1a4", "add_todo_end_time_001")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
