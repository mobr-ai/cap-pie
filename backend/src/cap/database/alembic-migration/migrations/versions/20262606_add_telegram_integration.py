from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "add_telegram_integration"
down_revision: str | Sequence[str] | None = "1a4dda3a21c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_account",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("cap_user_id", sa.Integer(), sa.ForeignKey("user.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("telegram_username", sa.String(64), nullable=True),
        sa.Column("first_name", sa.String(128), nullable=True),
        sa.Column("last_name", sa.String(128), nullable=True),
        sa.Column("auth_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("telegram_user_id", name="uq_telegram_account_user_id"),
        sa.UniqueConstraint("cap_user_id", name="uq_telegram_account_cap_user_id"),
    )
    op.create_index("idx_telegram_account_cap_user", "telegram_account", ["cap_user_id"])
    op.create_index("idx_telegram_account_telegram_user", "telegram_account", ["telegram_user_id"])

    op.create_table(
        "telegram_chat_binding",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=False),
        sa.Column("chat_type", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("created_by_telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("default_cap_user_id", sa.Integer(), sa.ForeignKey("user.user_id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.UniqueConstraint("telegram_chat_id", name="uq_telegram_chat_binding_chat_id"),
    )
    op.create_index("idx_telegram_chat_binding_chat", "telegram_chat_binding", ["telegram_chat_id"])
    op.create_index("idx_telegram_chat_binding_default_user", "telegram_chat_binding", ["default_cap_user_id"])

    op.create_table(
        "telegram_rendered_image",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cap_user_id", sa.Integer(), sa.ForeignKey("user.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("access_token", sa.String(96), nullable=False),
        sa.Column("mime", sa.String(64), nullable=False),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("etag", sa.String(64), nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_telegram_rendered_image_user", "telegram_rendered_image", ["cap_user_id"])
    op.create_index("idx_telegram_rendered_image_expires", "telegram_rendered_image", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_telegram_rendered_image_expires", table_name="telegram_rendered_image")
    op.drop_index("idx_telegram_rendered_image_user", table_name="telegram_rendered_image")
    op.drop_table("telegram_rendered_image")

    op.drop_index("idx_telegram_chat_binding_default_user", table_name="telegram_chat_binding")
    op.drop_index("idx_telegram_chat_binding_chat", table_name="telegram_chat_binding")
    op.drop_table("telegram_chat_binding")

    op.drop_index("idx_telegram_account_telegram_user", table_name="telegram_account")
    op.drop_index("idx_telegram_account_cap_user", table_name="telegram_account")
    op.drop_table("telegram_account")
