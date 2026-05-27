from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from cap.database.model import (
    BillingFeatureConfig,
    User,
    UserCreditBalance,
    UserEntitlement,
    UserUsagePeriod,
)

FEATURE_NL_QUERY = "nl_query"
ENTITLEMENT_PREMIUM = "cap_premium_access"
DEFAULT_FREE_QUERY_LIMIT = 5
DEFAULT_PERIOD_DAYS = 30
FREE_QUERY_REFILL_SECONDS = 24 * 60 * 60


class BillingAccessDenied(Exception):
    def __init__(self, payload: dict[str, Any]):
        super().__init__(payload.get("code", "billingAccessDenied"))
        self.payload = payload


@dataclass
class FeatureConfig:
    feature_code: str
    free_limit_count: int
    period_days: int
    payg_price_lovelace: int | None


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _to_db_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).replace(tzinfo=None)


def _from_db_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _format_utc(dt: datetime | None) -> str | None:
    fixed = _from_db_naive_utc(dt)
    return fixed.isoformat() if fixed else None


def _feature_config(db: Session, feature_code: str = FEATURE_NL_QUERY) -> FeatureConfig:
    row = db.scalar(
        select(BillingFeatureConfig)
        .where(
            BillingFeatureConfig.feature_code == feature_code,
            BillingFeatureConfig.is_active.is_(True),
        )
        .order_by(BillingFeatureConfig.id.desc())
    )

    if not row:
        return FeatureConfig(
            feature_code=feature_code,
            free_limit_count=DEFAULT_FREE_QUERY_LIMIT,
            period_days=DEFAULT_PERIOD_DAYS,
            payg_price_lovelace=None,
        )

    return FeatureConfig(
        feature_code=row.feature_code,
        free_limit_count=int(row.free_limit_count or 0),
        period_days=max(1, int(row.period_days or DEFAULT_PERIOD_DAYS)),
        payg_price_lovelace=(
            int(row.payg_price_lovelace)
            if row.payg_price_lovelace is not None
            else None
        ),
    )


def _period_window(now: datetime, period_days: int) -> tuple[datetime, datetime]:
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    elapsed_days = (now - epoch).days
    period_index = elapsed_days // max(1, int(period_days or DEFAULT_PERIOD_DAYS))
    start = epoch + timedelta(days=period_index * period_days)
    end = start + timedelta(days=period_days)
    return start, end


def _active_premium_entitlement(db: Session, user_id: int) -> UserEntitlement | None:
    now = _to_db_naive_utc(_utcnow())

    return db.scalar(
        select(UserEntitlement)
        .where(
            UserEntitlement.user_id == user_id,
            UserEntitlement.entitlement_code == ENTITLEMENT_PREMIUM,
            UserEntitlement.status == "active",
            UserEntitlement.starts_at <= now,
            UserEntitlement.expires_at > now,
        )
        .order_by(UserEntitlement.expires_at.desc(), UserEntitlement.id.desc())
    )


def _credit_balance_lovelace(db: Session, user_id: int) -> int:
    row = db.scalar(
        select(UserCreditBalance).where(
            UserCreditBalance.user_id == user_id,
            UserCreditBalance.currency == "lovelace",
        )
    )
    return int(row.balance or 0) if row else 0


def _usage_row(
    db: Session,
    *,
    user_id: int,
    feature_code: str,
    period_start: datetime,
    period_end: datetime,
    limit_count: int,
    create: bool,
    lock: bool = False,
) -> UserUsagePeriod | None:
    stmt = select(UserUsagePeriod).where(
        UserUsagePeriod.user_id == user_id,
        UserUsagePeriod.feature_code == feature_code,
        UserUsagePeriod.period_start == _to_db_naive_utc(period_start),
        UserUsagePeriod.period_end == _to_db_naive_utc(period_end),
    )

    if lock:
        stmt = stmt.with_for_update()

    row = db.scalar(stmt)

    if row or not create:
        return row

    now = _utcnow()
    capacity = max(0, int(limit_count or 0))

    row = UserUsagePeriod(
        user_id=user_id,
        feature_code=feature_code,
        period_start=_to_db_naive_utc(period_start),
        period_end=_to_db_naive_utc(period_end),
        used_count=0,
        limit_count=capacity,
        free_query_tokens=float(capacity),
        free_query_refilled_at=_to_db_naive_utc(now),
        created_at=_to_db_naive_utc(now),
        updated_at=_to_db_naive_utc(now),
    )
    db.add(row)
    db.flush()
    return row


def _free_query_bucket_state(
    usage: UserUsagePeriod | None,
    *,
    limit_count: int,
    now: datetime,
) -> dict[str, Any]:
    capacity = max(0, int(limit_count or 0))

    if capacity <= 0:
        return {
            "tokens": 0.0,
            "remaining": 0,
            "next_free_query_at": None,
            "seconds_until_next_free_query": None,
        }

    if usage is None:
        return {
            "tokens": float(capacity),
            "remaining": capacity,
            "next_free_query_at": None,
            "seconds_until_next_free_query": None,
        }

    stored_tokens = getattr(usage, "free_query_tokens", None)
    if stored_tokens is None:
        legacy_used = int(usage.used_count or 0)
        tokens = float(max(0, min(capacity, capacity - legacy_used)))
    else:
        tokens = float(stored_tokens)

    last_refill = (
        _from_db_naive_utc(getattr(usage, "free_query_refilled_at", None))
        or _from_db_naive_utc(getattr(usage, "updated_at", None))
        or _from_db_naive_utc(getattr(usage, "created_at", None))
        or now
    )

    elapsed_seconds = max(0.0, (now - last_refill).total_seconds())
    refill_rate = float(capacity) / float(FREE_QUERY_REFILL_SECONDS)
    tokens = min(float(capacity), tokens + (elapsed_seconds * refill_rate))

    remaining = max(0, min(capacity, int(tokens)))

    next_free_query_at = None
    seconds_until_next_free_query = None

    if remaining < 1 and tokens < capacity:
        seconds_until_next_free_query = int(max(1, round((1.0 - tokens) / refill_rate)))
        next_free_query_at = now + timedelta(seconds=seconds_until_next_free_query)

    usage.limit_count = capacity
    usage.free_query_tokens = tokens
    usage.free_query_refilled_at = _to_db_naive_utc(now)

    return {
        "tokens": tokens,
        "remaining": remaining,
        "next_free_query_at": next_free_query_at,
        "seconds_until_next_free_query": seconds_until_next_free_query,
    }


def get_billing_access_state(
    db: Session,
    user: User,
    *,
    feature_code: str = FEATURE_NL_QUERY,
    create_usage_period: bool = False,
) -> dict[str, Any]:
    now = _utcnow()
    config = _feature_config(db, feature_code)
    period_start, period_end = _period_window(now, config.period_days)

    entitlement = _active_premium_entitlement(db, user.user_id)
    balance_lovelace = _credit_balance_lovelace(db, user.user_id)

    usage = _usage_row(
        db,
        user_id=user.user_id,
        feature_code=config.feature_code,
        period_start=period_start,
        period_end=period_end,
        limit_count=config.free_limit_count,
        create=create_usage_period,
    )

    limit_count = int(usage.limit_count if usage else config.free_limit_count)
    bucket = _free_query_bucket_state(usage, limit_count=limit_count, now=now)
    remaining = int(bucket["remaining"])

    used_count = max(0, limit_count - remaining)
    premium_active = entitlement is not None

    if premium_active:
        access_mode = "premium"
        can_query = True
        blocked_reason = None
    elif remaining > 0:
        access_mode = "free"
        can_query = True
        blocked_reason = None
    else:
        access_mode = "blocked"
        can_query = False
        blocked_reason = "freeQueryLimitReached"

    return {
        "feature_code": config.feature_code,
        "can_query": can_query,
        "access_mode": access_mode,
        "blocked_reason": blocked_reason,
        "premium_active": premium_active,
        "premium_entitlement": (
            {
                "entitlement_code": entitlement.entitlement_code,
                "status": entitlement.status,
                "starts_at": _format_utc(entitlement.starts_at),
                "expires_at": _format_utc(entitlement.expires_at),
            }
            if entitlement
            else None
        ),
        "free_query_limit": limit_count,
        "free_query_used": used_count,
        "free_query_remaining": remaining,
        "free_query_tokens": round(float(bucket["tokens"]), 6),
        "free_query_refill_seconds": FREE_QUERY_REFILL_SECONDS,
        "next_free_query_at": _format_utc(bucket["next_free_query_at"]),
        "seconds_until_next_free_query": bucket["seconds_until_next_free_query"],
        "period_start": _format_utc(period_start),
        "period_end": _format_utc(period_end),
        "balance_lovelace": balance_lovelace,
        "payg_price_lovelace": config.payg_price_lovelace,
        "payg_enabled": False,
    }


def check_nl_query_access(db: Session, user: User) -> dict[str, Any]:
    state = get_billing_access_state(db, user, create_usage_period=False)

    if not state.get("can_query"):
        raise BillingAccessDenied(
            {
                "code": state.get("blocked_reason") or "billingAccessDenied",
                "message": "Query access is not available.",
                "access": state,
            }
        )

    return state


def _consume_free_query_token(
    db: Session,
    *,
    user: User,
    config: FeatureConfig,
    now: datetime,
) -> None:
    period_start, period_end = _period_window(now, config.period_days)

    usage = _usage_row(
        db,
        user_id=user.user_id,
        feature_code=config.feature_code,
        period_start=period_start,
        period_end=period_end,
        limit_count=config.free_limit_count,
        create=True,
        lock=True,
    )

    bucket = _free_query_bucket_state(
        usage,
        limit_count=int(usage.limit_count or config.free_limit_count),
        now=now,
    )

    tokens = float(bucket["tokens"])
    if tokens < 1.0:
        state = get_billing_access_state(db, user, create_usage_period=False)
        raise BillingAccessDenied(
            {
                "code": "freeQueryLimitReached",
                "message": "Free query limit reached.",
                "access": state,
            }
        )

    usage.free_query_tokens = max(0.0, tokens - 1.0)
    usage.free_query_refilled_at = _to_db_naive_utc(now)
    usage.used_count = int(usage.used_count or 0) + 1
    usage.updated_at = _to_db_naive_utc(now)
    db.add(usage)
    db.commit()


def consume_nl_query_success(db: Session, user: User) -> dict[str, Any]:
    config = _feature_config(db, FEATURE_NL_QUERY)
    now = _utcnow()

    entitlement = _active_premium_entitlement(db, user.user_id)

    if entitlement is not None:
        return get_billing_access_state(db, user, create_usage_period=False)

    _consume_free_query_token(db, user=user, config=config, now=now)
    return get_billing_access_state(db, user, create_usage_period=False)


def reserve_nl_query_access(db: Session, user: User) -> dict[str, Any]:
    config = _feature_config(db, FEATURE_NL_QUERY)
    now = _utcnow()

    entitlement = _active_premium_entitlement(db, user.user_id)

    if entitlement is not None:
        return get_billing_access_state(db, user, create_usage_period=False)

    _consume_free_query_token(db, user=user, config=config, now=now)
    return get_billing_access_state(db, user, create_usage_period=False)
