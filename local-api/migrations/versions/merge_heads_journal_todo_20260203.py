"""merge_heads_journal_todo_20260203

Revision ID: merge_heads_journal_todo_20260203
Revises: add_journal_panel_001, add_todo_attachment_source_001
Create Date: 2026-02-03
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "merge_heads_journal_todo_20260203"
down_revision: str | Sequence[str] | None = (
    "add_journal_panel_001",
    "add_todo_attachment_source_001",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SELECT 1")


def downgrade() -> None:
    op.execute("SELECT 1")
