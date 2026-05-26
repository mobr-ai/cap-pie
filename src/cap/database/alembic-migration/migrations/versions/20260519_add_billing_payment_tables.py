"""add billing payment tables

Revision ID: 20260519_add_billing_payment_tables
Revises: 1a4dda3a21c3
Create Date: 2026-05-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260519_add_billing_payment_tables"
down_revision: Union[str, Sequence[str], None] = "1a4dda3a21c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billing_plan",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entitlement_code", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_billing_plan_code"), "billing_plan", ["code"], unique=True)
    op.create_index(op.f("ix_billing_plan_entitlement_code"), "billing_plan", ["entitlement_code"], unique=False)

    op.create_table(
        "billing_payment_address",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("network", sa.String(length=32), nullable=False),
        sa.Column("address", sa.String(length=256), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_payment_address_address"), "billing_payment_address", ["address"], unique=False)
    op.create_index(op.f("ix_billing_payment_address_network"), "billing_payment_address", ["network"], unique=False)
    op.create_index("idx_billing_payment_address_network_active", "billing_payment_address", ["network", "is_active"], unique=False)

    op.create_table(
        "billing_price",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("network", sa.String(length=32), nullable=False),
        sa.Column("currency", sa.String(length=32), server_default=sa.text("'lovelace'"), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("starts_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["billing_plan.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_price_plan_id"), "billing_price", ["plan_id"], unique=False)
    op.create_index(op.f("ix_billing_price_network"), "billing_price", ["network"], unique=False)
    op.create_index(op.f("ix_billing_price_starts_at"), "billing_price", ["starts_at"], unique=False)
    op.create_index(op.f("ix_billing_price_ends_at"), "billing_price", ["ends_at"], unique=False)
    op.create_index("idx_billing_price_plan_network_active", "billing_price", ["plan_id", "network", "is_active"], unique=False)

    op.create_table(
        "payment_session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=True),
        sa.Column("price_id", sa.Integer(), nullable=True),
        sa.Column("payment_address_id", sa.Integer(), nullable=True),
        sa.Column("plan_code_snapshot", sa.String(length=64), nullable=False),
        sa.Column("entitlement_code_snapshot", sa.String(length=64), nullable=False),
        sa.Column("network_snapshot", sa.String(length=32), nullable=False),
        sa.Column("currency_snapshot", sa.String(length=32), nullable=False),
        sa.Column("amount_snapshot", sa.BigInteger(), nullable=False),
        sa.Column("payment_address_snapshot", sa.String(length=256), nullable=False),
        sa.Column("duration_days_snapshot", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("tx_hash", sa.String(length=128), nullable=True),
        sa.Column("provider_response", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["payment_address_id"], ["billing_payment_address.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_id"], ["billing_plan.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["price_id"], ["billing_price.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
    )
    op.create_index(op.f("ix_payment_session_session_id"), "payment_session", ["session_id"], unique=True)
    op.create_index(op.f("ix_payment_session_user_id"), "payment_session", ["user_id"], unique=False)
    op.create_index(op.f("ix_payment_session_plan_id"), "payment_session", ["plan_id"], unique=False)
    op.create_index(op.f("ix_payment_session_price_id"), "payment_session", ["price_id"], unique=False)
    op.create_index(op.f("ix_payment_session_payment_address_id"), "payment_session", ["payment_address_id"], unique=False)
    op.create_index(op.f("ix_payment_session_entitlement_code_snapshot"), "payment_session", ["entitlement_code_snapshot"], unique=False)
    op.create_index(op.f("ix_payment_session_status"), "payment_session", ["status"], unique=False)
    op.create_index(op.f("ix_payment_session_tx_hash"), "payment_session", ["tx_hash"], unique=False)
    op.create_index(op.f("ix_payment_session_expires_at"), "payment_session", ["expires_at"], unique=False)
    op.create_index(op.f("ix_payment_session_paid_at"), "payment_session", ["paid_at"], unique=False)
    op.create_index(op.f("ix_payment_session_created_at"), "payment_session", ["created_at"], unique=False)
    op.create_index("idx_payment_session_user_status", "payment_session", ["user_id", "status"], unique=False)
    op.create_index("idx_payment_session_status_expires", "payment_session", ["status", "expires_at"], unique=False)

    op.create_table(
        "user_entitlement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("entitlement_code", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("payment_session_id", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'active'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["payment_session_id"], ["payment_session.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_entitlement_user_id"), "user_entitlement", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_entitlement_entitlement_code"), "user_entitlement", ["entitlement_code"], unique=False)
    op.create_index(op.f("ix_user_entitlement_payment_session_id"), "user_entitlement", ["payment_session_id"], unique=False)
    op.create_index(op.f("ix_user_entitlement_starts_at"), "user_entitlement", ["starts_at"], unique=False)
    op.create_index(op.f("ix_user_entitlement_expires_at"), "user_entitlement", ["expires_at"], unique=False)
    op.create_index(op.f("ix_user_entitlement_status"), "user_entitlement", ["status"], unique=False)
    op.create_index(op.f("ix_user_entitlement_created_at"), "user_entitlement", ["created_at"], unique=False)
    op.create_index("idx_user_entitlement_user_code_status", "user_entitlement", ["user_id", "entitlement_code", "status"], unique=False)
    op.create_index("idx_user_entitlement_code_status_expires", "user_entitlement", ["entitlement_code", "status", "expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_user_entitlement_code_status_expires", table_name="user_entitlement")
    op.drop_index("idx_user_entitlement_user_code_status", table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_created_at"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_status"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_expires_at"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_starts_at"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_payment_session_id"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_entitlement_code"), table_name="user_entitlement")
    op.drop_index(op.f("ix_user_entitlement_user_id"), table_name="user_entitlement")
    op.drop_table("user_entitlement")

    op.drop_index("idx_payment_session_status_expires", table_name="payment_session")
    op.drop_index("idx_payment_session_user_status", table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_created_at"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_paid_at"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_expires_at"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_tx_hash"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_status"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_entitlement_code_snapshot"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_payment_address_id"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_price_id"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_plan_id"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_user_id"), table_name="payment_session")
    op.drop_index(op.f("ix_payment_session_session_id"), table_name="payment_session")
    op.drop_table("payment_session")

    op.drop_index("idx_billing_price_plan_network_active", table_name="billing_price")
    op.drop_index(op.f("ix_billing_price_ends_at"), table_name="billing_price")
    op.drop_index(op.f("ix_billing_price_starts_at"), table_name="billing_price")
    op.drop_index(op.f("ix_billing_price_network"), table_name="billing_price")
    op.drop_index(op.f("ix_billing_price_plan_id"), table_name="billing_price")
    op.drop_table("billing_price")

    op.drop_index("idx_billing_payment_address_network_active", table_name="billing_payment_address")
    op.drop_index(op.f("ix_billing_payment_address_network"), table_name="billing_payment_address")
    op.drop_index(op.f("ix_billing_payment_address_address"), table_name="billing_payment_address")
    op.drop_table("billing_payment_address")

    op.drop_index(op.f("ix_billing_plan_entitlement_code"), table_name="billing_plan")
    op.drop_index(op.f("ix_billing_plan_code"), table_name="billing_plan")
    op.drop_table("billing_plan")
