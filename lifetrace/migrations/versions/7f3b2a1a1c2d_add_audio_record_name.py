"""Add name to audio records."""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "7f3b2a1a1c2d"
down_revision = "4a2b9d7c3f11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audio_records", sa.Column("name", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("audio_records", "name")
