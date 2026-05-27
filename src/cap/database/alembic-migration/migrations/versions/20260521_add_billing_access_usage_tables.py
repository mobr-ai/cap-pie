"""add billing access usage tables

Revision ID: 20260521_add_billing_access_usage_tables
Revises: 20260520_add_prepaid_credit_tables
Create Date: 2026-05-21

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260521_add_billing_access_usage_tables"
down_revision: str | Sequence[str] | None = "20260520_add_prepaid_credit_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "billing_feature_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("feature_code", sa.String(length=64), nullable=False),
        sa.Column("free_limit_count", sa.Integer(), nullable=True),
        sa.Column("period_days", sa.Integer(), server_default=sa.text("30"), nullable=False),
        sa.Column("payg_price_lovelace", sa.BigInteger(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("TRUE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feature_code"),
    )
    op.create_index(op.f("ix_billing_feature_config_feature_code"), "billing_feature_config", ["feature_code"], unique=False)
    op.create_index(op.f("ix_billing_feature_config_is_active"), "billing_feature_config", ["is_active"], unique=False)
    op.create_index(op.f("ix_billing_feature_config_created_at"), "billing_feature_config", ["created_at"], unique=False)

    op.create_table(
        "user_usage_period",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("feature_code", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        sa.Column("used_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("limit_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "feature_code",
            "period_start",
            "period_end",
            name="uq_user_usage_period_user_feature_window",
        ),
    )
    op.create_index(op.f("ix_user_usage_period_user_id"), "user_usage_period", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_usage_period_feature_code"), "user_usage_period", ["feature_code"], unique=False)
    op.create_index(op.f("ix_user_usage_period_period_start"), "user_usage_period", ["period_start"], unique=False)
    op.create_index(op.f("ix_user_usage_period_period_end"), "user_usage_period", ["period_end"], unique=False)
    op.create_index(op.f("ix_user_usage_period_created_at"), "user_usage_period", ["created_at"], unique=False)
    op.create_index("idx_user_usage_period_user_feature", "user_usage_period", ["user_id", "feature_code"], unique=False)

    op.execute(
        """
        insert into billing_feature_config (
            feature_code,
            free_limit_count,
            period_days,
            payg_price_lovelace,
            is_active,
            created_at,
            updated_at
        )
        values (
            'nl_query',
            5,
            30,
            null,
            true,
            now(),
            now()
        )
        on conflict (feature_code) do update set
            free_limit_count = excluded.free_limit_count,
            period_days = excluded.period_days,
            payg_price_lovelace = excluded.payg_price_lovelace,
            is_active = true,
            updated_at = now()
        """
    )


def downgrade() -> None:
    op.drop_index("idx_user_usage_period_user_feature", table_name="user_usage_period")
    op.drop_index(op.f("ix_user_usage_period_created_at"), table_name="user_usage_period")
    op.drop_index(op.f("ix_user_usage_period_period_end"), table_name="user_usage_period")
    op.drop_index(op.f("ix_user_usage_period_period_start"), table_name="user_usage_period")
    op.drop_index(op.f("ix_user_usage_period_feature_code"), table_name="user_usage_period")
    op.drop_index(op.f("ix_user_usage_period_user_id"), table_name="user_usage_period")
    op.drop_table("user_usage_period")

    op.drop_index(op.f("ix_billing_feature_config_created_at"), table_name="billing_feature_config")
    op.drop_index(op.f("ix_billing_feature_config_is_active"), table_name="billing_feature_config")
    op.drop_index(op.f("ix_billing_feature_config_feature_code"), table_name="billing_feature_config")
    op.drop_table("billing_feature_config")
