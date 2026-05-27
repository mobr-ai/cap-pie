"""add prepaid credit tables

Revision ID: 20260520_add_prepaid_credit_tables
Revises: 20260519_add_billing_payment_tables
Create Date: 2026-05-20

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260520_add_prepaid_credit_tables"
down_revision: str | Sequence[str] | None = "20260519_add_billing_payment_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "payment_session",
        sa.Column(
            "kind",
            sa.String(length=32),
            server_default=sa.text("'plan_purchase'"),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_payment_session_kind"), "payment_session", ["kind"], unique=False)

    op.create_table(
        "user_credit_balance",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=32), server_default=sa.text("'lovelace'"), nullable=False),
        sa.Column("balance", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_credit_balance_user_id"), "user_credit_balance", ["user_id"], unique=False)
    op.create_index(
        "uq_user_credit_balance_user_currency",
        "user_credit_balance",
        ["user_id", "currency"],
        unique=True,
    )

    op.create_table(
        "user_credit_ledger",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=32), server_default=sa.text("'lovelace'"), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("balance_after", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("payment_session_id", sa.Integer(), nullable=True),
        sa.Column("related_entitlement_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=True),
        sa.ForeignKeyConstraint(["payment_session_id"], ["payment_session.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["related_entitlement_id"], ["user_entitlement.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.user_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_credit_ledger_user_id"), "user_credit_ledger", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_credit_ledger_reason"), "user_credit_ledger", ["reason"], unique=False)
    op.create_index(op.f("ix_user_credit_ledger_payment_session_id"), "user_credit_ledger", ["payment_session_id"], unique=False)
    op.create_index(op.f("ix_user_credit_ledger_related_entitlement_id"), "user_credit_ledger", ["related_entitlement_id"], unique=False)
    op.create_index(op.f("ix_user_credit_ledger_created_at"), "user_credit_ledger", ["created_at"], unique=False)
    op.create_index(
        "idx_user_credit_ledger_user_created",
        "user_credit_ledger",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_user_credit_ledger_user_created", table_name="user_credit_ledger")
    op.drop_index(op.f("ix_user_credit_ledger_created_at"), table_name="user_credit_ledger")
    op.drop_index(op.f("ix_user_credit_ledger_related_entitlement_id"), table_name="user_credit_ledger")
    op.drop_index(op.f("ix_user_credit_ledger_payment_session_id"), table_name="user_credit_ledger")
    op.drop_index(op.f("ix_user_credit_ledger_reason"), table_name="user_credit_ledger")
    op.drop_index(op.f("ix_user_credit_ledger_user_id"), table_name="user_credit_ledger")
    op.drop_table("user_credit_ledger")

    op.drop_index("uq_user_credit_balance_user_currency", table_name="user_credit_balance")
    op.drop_index(op.f("ix_user_credit_balance_user_id"), table_name="user_credit_balance")
    op.drop_table("user_credit_balance")

    op.drop_index(op.f("ix_payment_session_kind"), table_name="payment_session")
    op.drop_column("payment_session", "kind")
