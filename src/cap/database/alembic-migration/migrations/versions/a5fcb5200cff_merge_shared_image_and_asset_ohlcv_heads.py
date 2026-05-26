"""merge shared image and asset ohlcv heads

Revision ID: a5fcb5200cff
Revises: 20251221_add_shared_image_table, 20260509_add_asset_ohlcv
Create Date: 2026-05-18 14:46:31.969039

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5fcb5200cff'
down_revision: Union[str, Sequence[str], None] = ('20251221_add_shared_image_table', '20260509_add_asset_ohlcv')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
