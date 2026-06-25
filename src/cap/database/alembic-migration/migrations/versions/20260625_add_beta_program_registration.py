"""add beta program registration table

Revision ID: 20260625_add_beta_program_registration
Revises: 20260527_add_billing_notification_settings
Create Date: 2026-06-25 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20260625_add_beta_program_registration"
down_revision = "20260527_add_billing_notification_settings"
branch_labels = None
depends_on = None

TABLE_NAME = "beta_program_registration"


def _table_exists(bind, table_name: str) -> bool:
    return table_name in sa.inspect(bind).get_table_names()


def _existing_column_names(bind, table_name: str) -> set[str]:
    if not _table_exists(bind, table_name):
        return set()
    return {row["name"] for row in sa.inspect(bind).get_columns(table_name)}


def _add_missing_columns(bind) -> None:
    existing = _existing_column_names(bind, TABLE_NAME)

    columns = [
        ("email", sa.Column("email", sa.String(length=255), nullable=False)),
        ("full_name", sa.Column("full_name", sa.String(length=120), nullable=True)),
        ("role", sa.Column("role", sa.String(length=80), nullable=True)),
        ("organization", sa.Column("organization", sa.String(length=160), nullable=True)),
        ("use_case", sa.Column("use_case", sa.Text(), nullable=True)),
        ("language", sa.Column("language", sa.String(length=12), nullable=False, server_default=sa.text("'en'"))),
        ("source", sa.Column("source", sa.String(length=80), nullable=False, server_default=sa.text("'welcome_beta_cta'"))),
        ("status", sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'new'"))),
        ("admin_notes", sa.Column("admin_notes", sa.Text(), nullable=True)),
        ("created_at", sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()"))),
        ("updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()"))),
    ]

    for name, column in columns:
        if name not in existing:
            op.add_column(TABLE_NAME, column)


def _create_indexes() -> None:
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{TABLE_NAME}_email "
        f"ON {TABLE_NAME} (email)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_status "
        f"ON {TABLE_NAME} (status)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_created_at "
        f"ON {TABLE_NAME} (created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_beta_registration_status_created "
        f"ON {TABLE_NAME} (status, created_at)"
    )


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, TABLE_NAME):
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=120), nullable=True),
            sa.Column("role", sa.String(length=80), nullable=True),
            sa.Column("organization", sa.String(length=160), nullable=True),
            sa.Column("use_case", sa.Text(), nullable=True),
            sa.Column("language", sa.String(length=12), nullable=False, server_default=sa.text("'en'")),
            sa.Column("source", sa.String(length=80), nullable=False, server_default=sa.text("'welcome_beta_cta'")),
            sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'new'")),
            sa.Column("admin_notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()")),
        )
    else:
        _add_missing_columns(bind)

    _create_indexes()


def downgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, TABLE_NAME):
        return

    op.execute("DROP INDEX IF EXISTS idx_beta_registration_status_created")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_created_at")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_status")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_email")
    op.drop_table(TABLE_NAME)
