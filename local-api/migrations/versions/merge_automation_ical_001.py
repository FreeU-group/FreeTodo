"""merge_automation_ical_001

Revision ID: merge_automation_ical_001
Revises: merge_journal_uid_automation_20260204, add_icalendar_fields_v2_001
Create Date: 2026-02-06

Merge heads for automation tasks and iCalendar fields.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "merge_automation_ical_001"
down_revision: str | Sequence[str] | None = (
    "merge_journal_uid_automation_20260204",
    "add_icalendar_fields_v2_001",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge heads - no schema changes."""
    op.execute("SELECT 1")


def downgrade() -> None:
    """Merge heads - no schema changes."""
    op.execute("SELECT 1")
