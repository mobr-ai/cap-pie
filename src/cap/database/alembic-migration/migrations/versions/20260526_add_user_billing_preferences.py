"""add user billing preferences

Revision ID: 20260526_add_user_billing_preferences
Revises: 20260525_add_free_query_token_bucket
Create Date: 2026-05-26
"""

from alembic import op


revision = "20260526_add_user_billing_preferences"
down_revision = "20260525_add_free_query_token_bucket"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_billing_preference (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES "user" (user_id),
            auto_renew_premium_enabled BOOLEAN NOT NULL DEFAULT false,
            auto_renew_plan_code VARCHAR(64) NOT NULL DEFAULT 'cap_premium_access',
            payg_enabled BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_user_billing_preference_user_id
        ON user_billing_preference (user_id)
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_user_billing_preference_user_id")
    op.execute("DROP TABLE IF EXISTS user_billing_preference")
