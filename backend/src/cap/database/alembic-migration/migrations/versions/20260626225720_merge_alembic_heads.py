"""merge alembic heads

Revision ID: 20260626225720_merge_alembic_heads
Revises: 20260625_add_beta_program_registration, add_telegram_integration
Create Date: 2026-06-26T22:57:20

"""

from collections.abc import Sequence

revision: str = "20260626225720_merge_alembic_heads"
down_revision: str | tuple[str, ...] | None = (
    "20260625_add_beta_program_registration",
    "add_telegram_integration",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
