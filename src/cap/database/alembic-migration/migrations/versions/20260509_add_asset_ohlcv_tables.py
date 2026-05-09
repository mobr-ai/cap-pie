"""add asset ohlcv tables

Revision ID: 20260509_add_asset_ohlcv
Revises: 20251213_add_created_at_to_waiting_list
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa


revision = "20260509_add_asset_ohlcv"
down_revision = "20251213_add_created_at_to_waiting_list"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("asset_id", sa.Text(), nullable=False, unique=True),
        sa.Column("symbol", sa.Text(), nullable=False, index=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("policy_id", sa.Text(), nullable=True, index=True),
        sa.Column("asset_name_hex", sa.Text(), nullable=True),
        sa.Column("decimals", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "asset_ohlcv",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("asset_id", sa.Text(), sa.ForeignKey("asset.asset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval", sa.Text(), nullable=False),
        sa.Column("open", sa.Numeric(38, 18), nullable=False),
        sa.Column("high", sa.Numeric(38, 18), nullable=False),
        sa.Column("low", sa.Numeric(38, 18), nullable=False),
        sa.Column("close", sa.Numeric(38, 18), nullable=False),
        sa.Column("volume", sa.Numeric(38, 18), nullable=False),
        sa.Column("source", sa.Text(), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("asset_id", "ts", "interval", "source", name="uq_asset_ohlcv_asset_ts_interval_source"),
    )

    op.create_index("ix_asset_ohlcv_asset_ts", "asset_ohlcv", ["asset_id", "ts"])
    op.create_index("ix_asset_ohlcv_ts_interval", "asset_ohlcv", ["ts", "interval"])


def downgrade() -> None:
    op.drop_index("ix_asset_ohlcv_ts_interval", table_name="asset_ohlcv")
    op.drop_index("ix_asset_ohlcv_asset_ts", table_name="asset_ohlcv")
    op.drop_table("asset_ohlcv")
    op.drop_table("asset")