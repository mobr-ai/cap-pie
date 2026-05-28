import uuid

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "user"
    user_id        = Column(Integer, primary_key=True)
    email          = Column(String, unique=True, index=True, nullable=True)
    password_hash  = Column(String, nullable=True)
    google_id      = Column(String, unique=True, nullable=True)
    wallet_address = Column(String(128), index=True, nullable=True)
    username       = Column(String(30), unique=True, index=True, nullable=True)
    display_name   = Column(String(30), nullable=True)

    settings       = Column(String, nullable=True)
    refer_id       = Column(Integer)
    is_confirmed   = Column(Boolean, default=False)
    confirmation_token = Column(String(128), nullable=True)

    is_admin       = Column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,  # optional but nice for in-memory defaults
    )

    # on-prem avatar storage
    avatar_blob    = Column(LargeBinary, nullable=True)      # BYTEA
    avatar_mime    = Column(String(64), nullable=True)       # e.g., "image/png"
    avatar_etag    = Column(String(64), nullable=True)       # md5/sha1 for cache/If-None-Match

    # URL kept for compatibility
    avatar         = Column(String, nullable=True)


class CardanoAuthChallenge(Base):
    __tablename__ = "cardano_auth_challenge"

    id = Column(Integer, primary_key=True)

    # Public opaque ID returned to the frontend.
    challenge_id = Column(String(64), unique=True, nullable=False, index=True)

    # Wallet address that requested the challenge.
    wallet_address = Column(String(128), nullable=False, index=True)

    # Optional wallet metadata from frontend, e.g. "lace", "eternl", "nami".
    wallet_name = Column(String(64), nullable=True)

    # Random nonce included in the signed message.
    nonce = Column(String(128), nullable=False, unique=True, index=True)

    # Exact plaintext message that must be signed.
    message = Column(Text, nullable=False)

    # Hex version of message sent to CIP-30 signData.
    message_hex = Column(Text, nullable=False)

    # pending | used | expired | revoked
    status = Column(String(32), nullable=False, server_default=text("'pending'"))

    # Filled after successful verification.
    used_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    expires_at = Column(DateTime, nullable=False, index=True)

    __table_args__ = (
        Index("idx_cardano_auth_challenge_wallet_status", "wallet_address", "status"),
        Index("idx_cardano_auth_challenge_expires_status", "expires_at", "status"),
    )


class BillingPlan(Base):
    __tablename__ = "billing_plan"

    id = Column(Integer, primary_key=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    entitlement_code = Column(String(64), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    created_at = Column(DateTime, server_default=text("NOW()"))
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))


class BillingPrice(Base):
    __tablename__ = "billing_price"

    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("billing_plan.id", ondelete="CASCADE"), nullable=False, index=True)
    network = Column(String(32), nullable=False, index=True)
    currency = Column(String(32), nullable=False, server_default=text("'lovelace'"))
    amount = Column(BigInteger, nullable=False)
    duration_days = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    starts_at = Column(DateTime, nullable=False, server_default=text("NOW()"), index=True)
    ends_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_billing_price_plan_network_active", "plan_id", "network", "is_active"),
    )


class BillingPaymentAddress(Base):
    __tablename__ = "billing_payment_address"

    id = Column(Integer, primary_key=True)
    network = Column(String(32), nullable=False, index=True)
    address = Column(String(256), nullable=False, index=True)
    label = Column(String(120), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    created_at = Column(DateTime, server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_billing_payment_address_network_active", "network", "is_active"),
    )


class BillingFeatureConfig(Base):
    __tablename__ = "billing_feature_config"

    id = Column(Integer, primary_key=True)
    feature_code = Column(String(64), unique=True, nullable=False, index=True)
    free_limit_count = Column(Integer, nullable=True)
    period_days = Column(Integer, nullable=False, server_default=text("30"))
    payg_price_lovelace = Column(BigInteger, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("TRUE"), index=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))



class BillingNotificationSetting(Base):
    __tablename__ = "billing_notification_setting"

    id = Column(Integer, primary_key=True)
    event_code = Column(String(80), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    audience = Column(String(32), nullable=False, server_default=text("'user'"), default="user")
    channel = Column(String(32), nullable=False, server_default=text("'email'"), default="email")
    description = Column(Text, nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("user.user_id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))

    __table_args__ = (
        UniqueConstraint(
            "event_code",
            "audience",
            "channel",
            name="uq_billing_notification_setting_event_audience_channel",
        ),
        Index("idx_billing_notification_setting_enabled", "enabled"),
    )


class PaymentSession(Base):
    __tablename__ = "payment_session"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(80), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)

    kind = Column(String(32), nullable=False, server_default=text("'plan_purchase'"), index=True)

    plan_id = Column(Integer, ForeignKey("billing_plan.id", ondelete="SET NULL"), nullable=True, index=True)
    price_id = Column(Integer, ForeignKey("billing_price.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_address_id = Column(Integer, ForeignKey("billing_payment_address.id", ondelete="SET NULL"), nullable=True, index=True)

    plan_code_snapshot = Column(String(64), nullable=False)
    entitlement_code_snapshot = Column(String(64), nullable=False, index=True)
    network_snapshot = Column(String(32), nullable=False)
    currency_snapshot = Column(String(32), nullable=False)
    amount_snapshot = Column(BigInteger, nullable=False)
    payment_address_snapshot = Column(String(256), nullable=False)
    duration_days_snapshot = Column(Integer, nullable=False)

    status = Column(String(32), nullable=False, server_default=text("'pending'"), index=True)
    provider = Column(String(64), nullable=True)
    tx_hash = Column(String(128), nullable=True, index=True)
    provider_response = Column(JSON, nullable=True)

    expires_at = Column(DateTime, nullable=False, index=True)
    paid_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index("idx_payment_session_user_status", "user_id", "status"),
        Index("idx_payment_session_status_expires", "status", "expires_at"),
    )


class UserEntitlement(Base):
    __tablename__ = "user_entitlement"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    entitlement_code = Column(String(64), nullable=False, index=True)
    source = Column(String(64), nullable=False)
    payment_session_id = Column(Integer, ForeignKey("payment_session.id", ondelete="SET NULL"), nullable=True, index=True)

    starts_at = Column(DateTime, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    status = Column(String(32), nullable=False, server_default=text("'active'"), index=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index("idx_user_entitlement_user_code_status", "user_id", "entitlement_code", "status"),
        Index("idx_user_entitlement_code_status_expires", "entitlement_code", "status", "expires_at"),
    )


class UserCreditBalance(Base):
    __tablename__ = "user_credit_balance"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    currency = Column(String(32), nullable=False, server_default=text("'lovelace'"))
    balance = Column(BigInteger, nullable=False, server_default=text("0"))
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))

    __table_args__ = (
        Index("uq_user_credit_balance_user_currency", "user_id", "currency", unique=True),
    )


class UserCreditLedger(Base):
    __tablename__ = "user_credit_ledger"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    currency = Column(String(32), nullable=False, server_default=text("'lovelace'"))
    amount = Column(BigInteger, nullable=False)
    balance_after = Column(BigInteger, nullable=False)
    reason = Column(String(64), nullable=False, index=True)
    payment_session_id = Column(Integer, ForeignKey("payment_session.id", ondelete="SET NULL"), nullable=True, index=True)
    related_entitlement_id = Column(Integer, ForeignKey("user_entitlement.id", ondelete="SET NULL"), nullable=True, index=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index("idx_user_credit_ledger_user_created", "user_id", "created_at"),
    )


class UserBillingPreference(Base):
    __tablename__ = "user_billing_preference"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, unique=True, index=True)
    auto_renew_premium_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    auto_renew_plan_code = Column(String(64), nullable=False, server_default=text("'cap_premium_access'"))
    payg_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))


class UserUsagePeriod(Base):
    __tablename__ = "user_usage_period"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    feature_code = Column(String(64), nullable=False, index=True)
    period_start = Column(DateTime, nullable=False, index=True)
    period_end = Column(DateTime, nullable=False, index=True)
    used_count = Column(Integer, nullable=False, server_default=text("0"))
    limit_count = Column(Integer, nullable=False)
    free_query_tokens = Column(Float, nullable=True)
    free_query_refilled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "feature_code",
            "period_start",
            "period_end",
            name="uq_user_usage_period_user_feature_window",
        ),
        Index("idx_user_usage_period_user_feature", "user_id", "feature_code"),
    )



class Conversation(Base):
    __tablename__ = "conversation"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), index=True, nullable=False)
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime, server_default=text("NOW()"))
    updated_at = Column(DateTime, server_default=text("NOW()"), onupdate=text("NOW()"))


class ConversationMessage(Base):
    __tablename__ = "conversation_message"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(
        Integer,
        ForeignKey("conversation.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id = Column(Integer, ForeignKey("user.user_id"), index=True, nullable=True)
    role = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    nl_query_id = Column(Integer, ForeignKey("query_metrics.id"), index=True, nullable=True)
    created_at = Column(DateTime, server_default=text("NOW()"))


class ConversationArtifact(Base):
    __tablename__ = "conversation_artifact"

    id = Column(Integer, primary_key=True)

    conversation_id = Column(
        Integer,
        ForeignKey("conversation.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Optional linkage to the query metrics record that produced it
    nl_query_id = Column(
        Integer,
        ForeignKey("query_metrics.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # Optional linkage to a message (if you later want)
    conversation_message_id = Column(
        Integer,
        ForeignKey("conversation_message.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # "chart" | "table"
    artifact_type = Column(String(50), nullable=False)

    # e.g. "bar" | "pie" | "line" | "table" (optional)
    kv_type = Column(String(50), nullable=True)

    # config/spec payload (vegaSpec or kv table payload)
    config = Column(JSON, nullable=False)

    # stable dedupe key calculated by backend (unique per conversation)
    artifact_hash = Column(String(128), nullable=False)

    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index("idx_conversation_artifact_convo_created", "conversation_id", "created_at"),
        Index("uq_conversation_artifact_convo_hash", "conversation_id", "artifact_hash", unique=True),
    )


# -----------------------------
# Dashboards
# -----------------------------

class Dashboard(Base):
    __tablename__ = "dashboard"

    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("user.user_id"), index=True, nullable=False)
    name        = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_default  = Column(Boolean, default=False)

    created_at  = Column(DateTime, server_default=text("NOW()"))
    updated_at  = Column(
        DateTime,
        server_default=text("NOW()"),
        onupdate=text("NOW()"),
    )


class DashboardItem(Base):
    __tablename__ = "dashboard_item"

    id            = Column(Integer, primary_key=True)
    dashboard_id  = Column(
        Integer,
        ForeignKey("dashboard.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    conversation_message_id = Column(
        Integer,
        ForeignKey("conversation_message.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    conversation_id = Column(
        Integer,
        ForeignKey("conversation.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # "table", "chart" (extend later e.g. "metric", "indicator", etc.)
    artifact_type = Column(String(50), nullable=False)

    # Short label shown to the user
    title         = Column(String(150), nullable=False)

    # Optional: original NL query that produced it
    source_query  = Column(String(1000), nullable=True)

    # Arbitrary JSON config/spec (vega spec, kv payload, etc.)
    config        = Column(JSON, nullable=False)

    position      = Column(Integer, nullable=False, server_default=text("0"))

    created_at    = Column(DateTime, server_default=text("NOW()"))


# -----------------------------
# Metrics and Settings
# -----------------------------

class QueryMetrics(Base):
    __tablename__ = "query_metrics"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), index=True, nullable=True)

    # Query details
    nl_query = Column(Text, nullable=False)
    normalized_query = Column(Text, nullable=False, index=True)
    detected_language = Column(String(10), nullable=False, index=True)
    sparql_query = Column(Text, nullable=False)
    is_sequential = Column(Boolean, default=False)
    is_federated = Column(Boolean, default=False)

    # Results
    result_count = Column(Integer)
    result_type = Column(String(50))  # table, bar_chart, etc.
    kv_results = Column(JSON)

    # Quality indicators
    sparql_valid = Column(Boolean, nullable=False)
    semantic_valid = Column(Boolean, nullable=False)
    query_succeeded = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)

    # Complexity metrics
    complexity_score = Column(Integer, default=0)
    has_multi_relationship = Column(Boolean, default=False)
    has_aggregation = Column(Boolean, default=False)
    has_temporal = Column(Boolean, default=False)
    has_offchain_metadata = Column(Boolean, default=False)

    # Performance metrics (milliseconds)
    llm_latency_ms = Column(Integer)
    sparql_latency_ms = Column(Integer)
    total_latency_ms = Column(Integer)

    # Timestamps
    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    # Indexing for analytics
    __table_args__ = (
        Index('idx_query_metrics_language_date', 'detected_language', 'created_at'),
        Index('idx_query_metrics_user_date', 'user_id', 'created_at'),
        Index('idx_query_metrics_performance', 'total_latency_ms', 'created_at'),
    )


class KGMetrics(Base):
    __tablename__ = "kg_metrics"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(100), nullable=False, index=True)

    # Load metrics
    triples_loaded = Column(Integer, default=0)
    load_duration_ms = Column(Integer)
    load_succeeded = Column(Boolean, nullable=False)

    # Quality metrics
    ontology_aligned = Column(Boolean, default=True)
    has_offchain_metadata = Column(Boolean, default=False)

    # ETL context
    batch_number = Column(Integer)
    graph_uri = Column(String(500))

    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index('idx_kg_metrics_entity_date', 'entity_type', 'created_at'),
    )


class DashboardMetrics(Base):
    __tablename__ = "dashboard_metrics"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False, index=True)
    dashboard_id = Column(Integer, ForeignKey("dashboard.id"), nullable=False)

    action_type = Column(String(50), nullable=False)  # created, item_added, item_removed
    artifact_type = Column(String(50), nullable=True)  # table, bar_chart, etc.

    # State at time of action
    total_items = Column(Integer, default=0)
    unique_artifact_types = Column(Integer, default=0)

    created_at = Column(DateTime, server_default=text("NOW()"), index=True)

    __table_args__ = (
        Index('idx_dashboard_metrics_user_date', 'user_id', 'created_at'),
    )


class AdminSetting(Base):
    __tablename__ = "admin_setting"

    key = Column(String(64), primary_key=True)
    value = Column(JSON, nullable=False, server_default=text("'{}'::jsonb"))
    created_at = Column(DateTime, server_default=text("NOW()"))
    updated_at = Column(
        DateTime,
        server_default=text("NOW()"),
        onupdate=text("NOW()"),
    )


class SharedImage(Base):
    __tablename__ = "shared_image"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("user.user_id"), index=True, nullable=False)

    access_token = Column(String(64), nullable=False, index=True)

    content_sha256 = Column(String(64), nullable=False)
    mime = Column(String(64), nullable=False)
    bytes = Column(Integer, nullable=False)
    etag = Column(String(64), nullable=False)

    storage_path = Column(String(512), nullable=False)

    created_at = Column(DateTime, server_default=text("NOW()"), index=True)
    expires_at = Column(DateTime, nullable=False, index=True)

    __table_args__ = (
        Index("uq_shared_image_user_sha", "user_id", "content_sha256", unique=True),
        Index("idx_shared_image_expires", "expires_at"),
    )

class Asset(Base):
    __tablename__ = "asset"

    id = Column(BigInteger, primary_key=True)
    asset_id = Column(Text, nullable=False, unique=True)
    symbol = Column(Text, nullable=False, index=True)
    name = Column(Text, nullable=True)
    policy_id = Column(Text, nullable=True, index=True)
    asset_name_hex = Column(Text, nullable=True)
    decimals = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class AssetOHLCV(Base):
    __tablename__ = "asset_ohlcv"

    id = Column(BigInteger, primary_key=True)
    asset_id = Column(Text, ForeignKey("asset.asset_id", ondelete="CASCADE"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False)
    interval = Column(Text, nullable=False)
    open = Column(Numeric(38, 18), nullable=False)
    high = Column(Numeric(38, 18), nullable=False)
    low = Column(Numeric(38, 18), nullable=False)
    close = Column(Numeric(38, 18), nullable=False)
    volume = Column(Numeric(38, 18), nullable=False)
    source = Column(Text, nullable=False, server_default=text("'unknown'"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    __table_args__ = (
        UniqueConstraint("asset_id", "ts", "interval", "source", name="uq_asset_ohlcv_asset_ts_interval_source"),
        Index("ix_asset_ohlcv_asset_ts", "asset_id", "ts"),
        Index("ix_asset_ohlcv_ts_interval", "ts", "interval"),
    )
