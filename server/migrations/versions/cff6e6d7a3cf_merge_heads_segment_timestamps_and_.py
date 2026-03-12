"""merge heads: segment_timestamps and optimized_extraction

Revision ID: cff6e6d7a3cf
Revises: 034079ad387f, add_optimized_extraction_001
Create Date: 2026-01-23 20:34:00.629399

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "cff6e6d7a3cf"
down_revision: str | None = ("034079ad387f", "add_optimized_extraction_001")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
