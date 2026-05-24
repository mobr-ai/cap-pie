from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import get_current_admin_user
from cap.database.model import PaymentSession, User
from cap.database.session import get_db
from cap.services.billing_access import get_billing_access_state

router = APIRouter(prefix="/api/v1/admin/billing", tags=["billing_admin"])


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


def _user_identity_payload(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "username": user.username,
        "wallet_address": user.wallet_address,
        "display_name": user.display_name,
        "is_confirmed": bool(user.is_confirmed),
        "is_admin": bool(getattr(user, "is_admin", False)),
    }


def _payment_payload(row: PaymentSession | None) -> dict | None:
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


def _billing_user_payload(db: Session, user: User) -> dict:
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
