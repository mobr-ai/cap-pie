"""add user billing preferences

Revision ID: 20260526_add_user_billing_preferences
Revises: 20260525_add_free_query_token_bucket
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260526_add_user_billing_preferences"
down_revision = "20260525_add_free_query_token_bucket"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_billing_preference",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.user_id"), nullable=False),
        sa.Column(
            "auto_renew_premium_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "auto_renew_plan_code",
            sa.String(length=64),
            nullable=False,
            server_default=sa.text("'cap_premium_access'"),
        ),
        sa.Column(
            "payg_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()")),
    )

    op.create_index(
        "ix_user_billing_preference_user_id",
        "user_billing_preference",
        ["user_id"],
        unique=True,
    )


def downgrade():
    op.drop_index("ix_user_billing_preference_user_id", table_name="user_billing_preference")
    op.drop_table("user_billing_preference")
