"""add free query token bucket

Revision ID: 20260525_add_free_query_token_bucket
Revises: 20260521_add_billing_access_usage_tables
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "20260525_add_free_query_token_bucket"
down_revision = "20260521_add_billing_access_usage_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user_usage_period",
        sa.Column("free_query_tokens", sa.Float(), nullable=True),
    )
    op.add_column(
        "user_usage_period",
        sa.Column("free_query_refilled_at", sa.DateTime(), nullable=True),
    )

    op.execute("""
        UPDATE user_usage_period
        SET
            free_query_tokens = CAST(
                GREATEST(0, LEAST(limit_count, limit_count - used_count))
                AS DOUBLE PRECISION
            ),
            free_query_refilled_at = COALESCE(updated_at, created_at, NOW())
        WHERE free_query_tokens IS NULL
    """)


def downgrade():
    op.drop_column("user_usage_period", "free_query_refilled_at")
    op.drop_column("user_usage_period", "free_query_tokens")
