from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import get_current_admin_user
from cap.database.model import (
    PaymentSession,
    User,
    UserCreditBalance,
    UserCreditLedger,
    UserEntitlement,
    UserUsagePeriod,
)
from cap.database.session import get_db
from cap.services.billing_access import (
    ENTITLEMENT_PREMIUM,
    FEATURE_NL_QUERY,
    _feature_config,
    _period_window,
    get_billing_access_state,
)

router = APIRouter(prefix="/api/v1/admin/billing", tags=["billing_admin"])


class GrantPremiumIn(BaseModel):
    days: int = Field(default=30, ge=1, le=3650)
    note: str | None = None


class RevokePremiumIn(BaseModel):
    note: str | None = None


class ResetQuotaIn(BaseModel):
    feature_code: str = FEATURE_NL_QUERY
    note: str | None = None


class AdjustBalanceIn(BaseModel):
    amount_lovelace: int
    reason: str = "admin_adjustment"
    note: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_db_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _from_db_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _format_utc(dt: datetime | None) -> str | None:
    fixed = _from_db_naive_utc(dt)
    return fixed.isoformat() if fixed else None


def _lovelace_to_ada(value: int | None) -> float:
    return round((int(value or 0) / 1_000_000), 6)


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.scalar(select(User).where(User.user_id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="userNotFound")
    return user


def _user_identity_payload(user: User) -> dict[str, Any]:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "username": user.username,
        "wallet_address": user.wallet_address,
        "display_name": user.display_name,
        "is_confirmed": bool(user.is_confirmed),
        "is_admin": bool(getattr(user, "is_admin", False)),
    }


def _payment_payload(row: PaymentSession | None) -> dict[str, Any] | None:
    if not row:
        return None

    return {
        "id": row.id,
        "session_id": row.session_id,
        "kind": getattr(row, "kind", None),
        "plan_code": row.plan_code_snapshot,
        "entitlement_code": row.entitlement_code_snapshot,
        "network": row.network_snapshot,
        "currency": row.currency_snapshot,
        "amount_lovelace": int(row.amount_snapshot or 0),
        "amount_ada": _lovelace_to_ada(row.amount_snapshot),
        "status": row.status,
        "provider": row.provider,
        "tx_hash": row.tx_hash,
        "expires_at": _format_utc(row.expires_at),
        "paid_at": _format_utc(row.paid_at),
        "created_at": _format_utc(row.created_at),
    }


def _billing_user_payload(db: Session, user: User) -> dict[str, Any]:
    access = get_billing_access_state(
        db,
        user,
        create_usage_period=False,
    )

    last_payment = db.scalar(
        select(PaymentSession)
        .where(PaymentSession.user_id == user.user_id)
        .order_by(PaymentSession.created_at.desc(), PaymentSession.id.desc())
    )

    entitlement = access.get("premium_entitlement") or {}
    balance_lovelace = int(access.get("balance_lovelace") or 0)

    return {
        **_user_identity_payload(user),
        "access_mode": access.get("access_mode"),
        "can_query": bool(access.get("can_query")),
        "blocked_reason": access.get("blocked_reason"),
        "premium_active": bool(access.get("premium_active")),
        "premium_entitlement": access.get("premium_entitlement"),
        "premium_expires_at": entitlement.get("expires_at"),
        "free_query_limit": int(access.get("free_query_limit") or 0),
        "free_query_used": int(access.get("free_query_used") or 0),
        "free_query_remaining": int(access.get("free_query_remaining") or 0),
        "period_start": access.get("period_start"),
        "period_end": access.get("period_end"),
        "balance_lovelace": balance_lovelace,
        "balance_ada": _lovelace_to_ada(balance_lovelace),
        "payg_enabled": bool(access.get("payg_enabled")),
        "payg_price_lovelace": access.get("payg_price_lovelace"),
        "last_payment": _payment_payload(last_payment),
    }


def _get_or_create_balance(db: Session, *, user_id: int) -> UserCreditBalance:
    row = db.scalar(
        select(UserCreditBalance)
        .where(
            UserCreditBalance.user_id == user_id,
            UserCreditBalance.currency == "lovelace",
        )
        .with_for_update()
    )

    if row:
        return row

    row = UserCreditBalance(
        user_id=user_id,
        currency="lovelace",
        balance=0,
        updated_at=_to_db_naive_utc(_utcnow()),
    )
    db.add(row)
    db.flush()
    return row


@router.get("/users")
def list_admin_billing_users(
    search: str | None = Query(None, description="Search by email, username, or wallet"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    stmt = select(User)

    if search:
        term = f"%{search.lower().strip()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(term),
                func.lower(User.username).like(term),
                func.lower(User.wallet_address).like(term),
                func.lower(User.display_name).like(term),
            )
        )

    count_stmt = stmt.with_only_columns(func.count()).order_by(None)
    total = db.scalar(count_stmt) or 0

    users = db.scalars(
        stmt.order_by(User.user_id.asc()).limit(limit).offset(offset)
    ).all()

    items = [_billing_user_payload(db, user) for user in users]

    shown_premium = sum(1 for row in items if row.get("premium_active"))
    shown_blocked = sum(1 for row in items if row.get("access_mode") == "blocked")
    shown_balance_lovelace = sum(int(row.get("balance_lovelace") or 0) for row in items)

    total_users = db.scalar(select(func.count()).select_from(User)) or 0

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": items,
        "stats": {
            "total_users": total_users,
            "filtered_total": total,
            "shown_premium": shown_premium,
            "shown_blocked": shown_blocked,
            "shown_balance_lovelace": shown_balance_lovelace,
            "shown_balance_ada": _lovelace_to_ada(shown_balance_lovelace),
        },
    }


@router.post("/users/{user_id}/grant-premium")
def admin_grant_premium(
    user_id: int,
    payload: GrantPremiumIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    user = _get_user_or_404(db, user_id)
    now = _utcnow()

    existing = db.scalar(
        select(UserEntitlement)
        .where(
            UserEntitlement.user_id == user.user_id,
            UserEntitlement.entitlement_code == ENTITLEMENT_PREMIUM,
            UserEntitlement.status == "active",
        )
        .order_by(UserEntitlement.expires_at.desc(), UserEntitlement.id.desc())
        .with_for_update()
    )

    if existing:
        current_expires = _from_db_naive_utc(existing.expires_at)
        base = current_expires if current_expires and current_expires > now else now
        existing.expires_at = _to_db_naive_utc(base + timedelta(days=payload.days))
        existing.source = "admin_grant"
        db.add(existing)
    else:
        existing = UserEntitlement(
            user_id=user.user_id,
            entitlement_code=ENTITLEMENT_PREMIUM,
            source="admin_grant",
            payment_session_id=None,
            starts_at=_to_db_naive_utc(now),
            expires_at=_to_db_naive_utc(now + timedelta(days=payload.days)),
            status="active",
        )
        db.add(existing)

    db.commit()
    db.refresh(user)

    return {
        "status": "ok",
        "action": "grant_premium",
        "item": _billing_user_payload(db, user),
    }


@router.post("/users/{user_id}/revoke-premium")
def admin_revoke_premium(
    user_id: int,
    payload: RevokePremiumIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    user = _get_user_or_404(db, user_id)
    now = _to_db_naive_utc(_utcnow())

    rows = db.scalars(
        select(UserEntitlement)
        .where(
            UserEntitlement.user_id == user.user_id,
            UserEntitlement.entitlement_code == ENTITLEMENT_PREMIUM,
            UserEntitlement.status == "active",
            UserEntitlement.expires_at > now,
        )
        .with_for_update()
    ).all()

    for row in rows:
        row.status = "revoked"
        row.expires_at = now
        row.source = "admin_revoked"
        db.add(row)

    db.commit()
    db.refresh(user)

    return {
        "status": "ok",
        "action": "revoke_premium",
        "revoked_count": len(rows),
        "item": _billing_user_payload(db, user),
    }


@router.post("/users/{user_id}/reset-free-quota")
def admin_reset_free_quota(
    user_id: int,
    payload: ResetQuotaIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    user = _get_user_or_404(db, user_id)
    feature_code = (payload.feature_code or FEATURE_NL_QUERY).strip() or FEATURE_NL_QUERY
    now = _utcnow()
    config = _feature_config(db, feature_code)
    period_start, period_end = _period_window(now, config.period_days)

    row = db.scalar(
        select(UserUsagePeriod)
        .where(
            UserUsagePeriod.user_id == user.user_id,
            UserUsagePeriod.feature_code == feature_code,
            UserUsagePeriod.period_start == _to_db_naive_utc(period_start),
            UserUsagePeriod.period_end == _to_db_naive_utc(period_end),
        )
        .with_for_update()
    )

    if row:
        row.used_count = 0
        row.limit_count = config.free_limit_count
        row.updated_at = _to_db_naive_utc(now)
        db.add(row)
    else:
        row = UserUsagePeriod(
            user_id=user.user_id,
            feature_code=feature_code,
            period_start=_to_db_naive_utc(period_start),
            period_end=_to_db_naive_utc(period_end),
            used_count=0,
            limit_count=config.free_limit_count,
            created_at=_to_db_naive_utc(now),
            updated_at=_to_db_naive_utc(now),
        )
        db.add(row)

    db.commit()
    db.refresh(user)

    return {
        "status": "ok",
        "action": "reset_free_quota",
        "item": _billing_user_payload(db, user),
    }


@router.post("/users/{user_id}/adjust-balance")
def admin_adjust_balance(
    user_id: int,
    payload: AdjustBalanceIn,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    user = _get_user_or_404(db, user_id)
    amount = int(payload.amount_lovelace or 0)

    if amount == 0:
        raise HTTPException(status_code=400, detail="amountCannotBeZero")

    reason = (payload.reason or "admin_adjustment").strip() or "admin_adjustment"

    balance = _get_or_create_balance(db, user_id=user.user_id)
    current_balance = int(balance.balance or 0)
    next_balance = current_balance + amount

    if next_balance < 0:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "balanceCannotBecomeNegative",
                "balance_lovelace": current_balance,
                "amount_lovelace": amount,
            },
        )

    balance.balance = next_balance
    balance.updated_at = _to_db_naive_utc(_utcnow())
    db.add(balance)
    db.flush()

    ledger = UserCreditLedger(
        user_id=user.user_id,
        currency="lovelace",
        amount=amount,
        balance_after=next_balance,
        reason=reason,
        payment_session_id=None,
        related_entitlement_id=None,
        metadata_json={
            "source": "admin",
            "admin_user_id": admin.user_id,
            "note": payload.note,
        },
    )
    db.add(ledger)

    db.commit()
    db.refresh(user)

    return {
        "status": "ok",
        "action": "adjust_balance",
        "item": _billing_user_payload(db, user),
    }
