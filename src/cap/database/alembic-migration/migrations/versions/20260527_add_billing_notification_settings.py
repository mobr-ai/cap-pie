"""add billing notification settings

Revision ID: 20260527_add_billing_notification_settings
Revises: 20260526_add_user_billing_preferences
Create Date: 2026-05-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260527_add_billing_notification_settings"
down_revision = "20260526_add_user_billing_preferences"
branch_labels = None
depends_on = None


TABLE_NAME = "billing_notification_setting"
UNIQUE_NAME = "uq_billing_notification_setting_event_audience_channel"

DEFAULT_NOTIFICATION_SETTINGS = [
    ("payment_session_created", False, "user", "email", "Send an email when a Cardano payment session is created."),
    ("payment_confirmed", False, "user", "email", "Send a generic payment confirmation email."),
    ("payment_failed", True, "user", "email", "Send an email when payment verification fails."),
    ("balance_credited", True, "user", "email", "Send an email when CAP Balance is credited."),
    ("premium_activated", True, "user", "email", "Send an email when Premium access is activated."),
    ("premium_extended", True, "user", "email", "Send an email when Premium access is extended."),
    ("support_contribution_confirmed", True, "user", "email", "Send an email when a support contribution is confirmed."),
    ("auto_renew_enabled", True, "user", "email", "Send an email when Balance-funded auto-renewal is enabled."),
    ("auto_renew_disabled", True, "user", "email", "Send an email when Balance-funded auto-renewal is disabled."),
    ("auto_renew_succeeded", True, "user", "email", "Send an email when Balance-funded auto-renewal succeeds."),
    ("auto_renew_failed", True, "user", "email", "Send an email when Balance-funded auto-renewal fails."),
    ("admin_premium_granted", True, "user", "email", "Send an email when an admin grants Premium access."),
    ("admin_premium_revoked", True, "user", "email", "Send an email when an admin revokes Premium access."),
    ("admin_balance_adjusted", True, "user", "email", "Send an email when an admin adjusts CAP Balance."),
]


def _table_exists(bind, table_name: str) -> bool:
    return table_name in sa.inspect(bind).get_table_names()


def _existing_column_names(bind, table_name: str) -> set[str]:
    if not _table_exists(bind, table_name):
        return set()
    return {row["name"] for row in sa.inspect(bind).get_columns(table_name)}


def _existing_unique_names(bind, table_name: str) -> set[str]:
    if not _table_exists(bind, table_name):
        return set()
    return {
        row.get("name")
        for row in sa.inspect(bind).get_unique_constraints(table_name)
        if row.get("name")
    }


def _create_missing_table_columns(bind) -> None:
    """Repair partially-created local/dev tables without failing on existing columns."""
    existing_columns = _existing_column_names(bind, TABLE_NAME)

    columns_to_add = [
        ("event_code", sa.Column("event_code", sa.String(length=80), nullable=False)),
        ("enabled", sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"))),
        ("audience", sa.Column("audience", sa.String(length=32), nullable=False, server_default=sa.text("'user'"))),
        ("channel", sa.Column("channel", sa.String(length=32), nullable=False, server_default=sa.text("'email'"))),
        ("description", sa.Column("description", sa.Text(), nullable=True)),
        ("updated_by_user_id", sa.Column("updated_by_user_id", sa.Integer(), nullable=True)),
        ("created_at", sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()"))),
        ("updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()"))),
    ]

    for column_name, column in columns_to_add:
        if column_name not in existing_columns:
            op.add_column(TABLE_NAME, column)


def _create_missing_indexes(bind) -> None:
    # PostgreSQL-safe and idempotent. CAP migrations already target PostgreSQL.
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_event_code "
        f"ON {TABLE_NAME} (event_code)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_updated_by_user_id "
        f"ON {TABLE_NAME} (updated_by_user_id)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_created_at "
        f"ON {TABLE_NAME} (created_at)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_enabled "
        f"ON {TABLE_NAME} (enabled)"
    )


def _create_missing_unique_constraint(bind) -> None:
    if UNIQUE_NAME not in _existing_unique_names(bind, TABLE_NAME):
        op.create_unique_constraint(
            UNIQUE_NAME,
            TABLE_NAME,
            ["event_code", "audience", "channel"],
        )


def _seed_default_settings(bind) -> None:
    bind.execute(
        sa.text(
            f"""
            INSERT INTO {TABLE_NAME}
                (event_code, enabled, audience, channel, description)
            VALUES
                (:event_code, :enabled, :audience, :channel, :description)
            ON CONFLICT (event_code, audience, channel) DO NOTHING
            """
        ),
        [
            {
                "event_code": event_code,
                "enabled": enabled,
                "audience": audience,
                "channel": channel,
                "description": description,
            }
            for event_code, enabled, audience, channel, description in DEFAULT_NOTIFICATION_SETTINGS
        ],
    )


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, TABLE_NAME):
        op.create_table(
            TABLE_NAME,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("event_code", sa.String(length=80), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("audience", sa.String(length=32), nullable=False, server_default=sa.text("'user'")),
            sa.Column("channel", sa.String(length=32), nullable=False, server_default=sa.text("'email'")),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("NOW()")),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.user_id"], ondelete="SET NULL"),
            sa.UniqueConstraint(
                "event_code",
                "audience",
                "channel",
                name=UNIQUE_NAME,
            ),
        )
    else:
        _create_missing_table_columns(bind)
        _create_missing_unique_constraint(bind)

    _create_missing_indexes(bind)
    _seed_default_settings(bind)


def downgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, TABLE_NAME):
        return

    op.execute(f"DROP INDEX IF EXISTS idx_{TABLE_NAME}_enabled")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_created_at")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_updated_by_user_id")
    op.execute(f"DROP INDEX IF EXISTS ix_{TABLE_NAME}_event_code")
    op.drop_table(TABLE_NAME)
