"""baseline

Revision ID: base_20251030
Revises:
Create Date: 2025-10-30 21:44:14.594556

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'base_20251030'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
