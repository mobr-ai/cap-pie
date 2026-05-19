from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import get_current_user
from cap.core.cardano_payment_verifier import get_cardano_payment_verifier
from cap.database.model import (
    BillingPaymentAddress,
    BillingPlan,
    BillingPrice,
    PaymentSession,
    User,
    UserEntitlement,
)
from cap.database.session import get_db

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class CreateCardanoPaymentSessionIn(BaseModel):
    plan_code: str = "cap_premium_access"


class VerifyCardanoPaymentIn(BaseModel):
    session_id: str
    tx_hash: str


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
    if dt is None:
        return None
    fixed = _from_db_naive_utc(dt)
    return fixed.isoformat() if fixed else None


def _network() -> str:
    return os.getenv("CARDANO_NETWORK", "mainnet").strip().lower()


def _active_plan_bundle(db: Session, plan_code: str, network: str):
    now = _to_db_naive_utc(_utcnow())

    plan = db.scalar(
        select(BillingPlan).where(
            BillingPlan.code == plan_code,
            BillingPlan.is_active.is_(True),
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="billingPlanNotFound")

    price = db.scalar(
        select(BillingPrice)
        .where(
            BillingPrice.plan_id == plan.id,
            BillingPrice.network == network,
            BillingPrice.is_active.is_(True),
            BillingPrice.starts_at <= now,
            (BillingPrice.ends_at.is_(None)) | (BillingPrice.ends_at > now),
        )
        .order_by(BillingPrice.starts_at.desc(), BillingPrice.id.desc())
    )
    if not price:
        raise HTTPException(status_code=404, detail="billingPriceNotConfigured")

    payment_address = db.scalar(
        select(BillingPaymentAddress)
        .where(
            BillingPaymentAddress.network == network,
            BillingPaymentAddress.is_active.is_(True),
        )
        .order_by(BillingPaymentAddress.id.desc())
    )
    if not payment_address:
        raise HTTPException(status_code=404, detail="billingPaymentAddressNotConfigured")

    return plan, price, payment_address


def _session_response(session: PaymentSession):
    return {
        "session_id": session.session_id,
        "plan_code": session.plan_code_snapshot,
        "entitlement_code": session.entitlement_code_snapshot,
        "network": session.network_snapshot,
        "currency": session.currency_snapshot,
        "amount": session.amount_snapshot,
        "payment_address": session.payment_address_snapshot,
        "status": session.status,
        "tx_hash": session.tx_hash,
        "provider": session.provider,
        "expires_at": _format_utc(session.expires_at),
        "paid_at": _format_utc(session.paid_at),
        "created_at": _format_utc(session.created_at),
    }


def _grant_entitlement(
    db: Session,
    *,
    user: User,
    session: PaymentSession,
    duration_days: int,
) -> UserEntitlement:
    now = _utcnow()
    starts_at = now
    expires_at = now + timedelta(days=int(duration_days))

    existing = db.scalar(
        select(UserEntitlement)
        .where(
            UserEntitlement.user_id == user.user_id,
            UserEntitlement.entitlement_code == session.entitlement_code_snapshot,
            UserEntitlement.status == "active",
        )
        .order_by(UserEntitlement.expires_at.desc(), UserEntitlement.id.desc())
    )

    if existing:
        existing_expires = _from_db_naive_utc(existing.expires_at)
        base = existing_expires if existing_expires and existing_expires > now else now
        existing.expires_at = _to_db_naive_utc(base + timedelta(days=int(duration_days)))
        existing.source = "cardano_payment"
        existing.payment_session_id = session.id
        db.add(existing)
        return existing

    entitlement = UserEntitlement(
        user_id=user.user_id,
        entitlement_code=session.entitlement_code_snapshot,
        source="cardano_payment",
        payment_session_id=session.id,
        starts_at=_to_db_naive_utc(starts_at),
        expires_at=_to_db_naive_utc(expires_at),
        status="active",
    )
    db.add(entitlement)
    return entitlement


@router.get("/plans")
def list_billing_plans(db: Session = Depends(get_db)):
    network = _network()
    now = _to_db_naive_utc(_utcnow())

    rows = (
        db.query(BillingPlan, BillingPrice)
        .join(BillingPrice, BillingPrice.plan_id == BillingPlan.id)
        .filter(
            BillingPlan.is_active.is_(True),
            BillingPrice.is_active.is_(True),
            BillingPrice.network == network,
            BillingPrice.starts_at <= now,
            (BillingPrice.ends_at.is_(None)) | (BillingPrice.ends_at > now),
        )
        .order_by(BillingPlan.id.asc(), BillingPrice.id.desc())
        .all()
    )

    seen: set[str] = set()
    plans = []

    for plan, price in rows:
        if plan.code in seen:
            continue
        seen.add(plan.code)
        plans.append(
            {
                "code": plan.code,
                "name": plan.name,
                "description": plan.description,
                "entitlement_code": plan.entitlement_code,
                "network": price.network,
                "currency": price.currency,
                "amount": price.amount,
                "duration_days": price.duration_days,
            }
        )

    return {"network": network, "plans": plans}


@router.post("/cardano/session")
def create_cardano_payment_session(
    data: CreateCardanoPaymentSessionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    network = _network()
    plan_code = (data.plan_code or "").strip()

    if not plan_code:
        raise HTTPException(status_code=400, detail="missingPlanCode")

    plan, price, payment_address = _active_plan_bundle(db, plan_code, network)

    now = _utcnow()
    session = PaymentSession(
        session_id=f"pay_{secrets.token_urlsafe(24)}",
        user_id=current_user.user_id,
        plan_id=plan.id,
        price_id=price.id,
        payment_address_id=payment_address.id,
        plan_code_snapshot=plan.code,
        entitlement_code_snapshot=plan.entitlement_code,
        network_snapshot=network,
        currency_snapshot=price.currency,
        amount_snapshot=price.amount,
        payment_address_snapshot=payment_address.address,
        duration_days_snapshot=price.duration_days,
        status="pending",
        provider=os.getenv("CARDANO_PAYMENT_VERIFIER", "blockfrost").strip().lower(),
        expires_at=_to_db_naive_utc(now + timedelta(minutes=30)),
        created_at=_to_db_naive_utc(now),
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return _session_response(session)


@router.post("/cardano/verify")
def verify_cardano_payment(
    data: VerifyCardanoPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session_id = (data.session_id or "").strip()
    tx_hash = (data.tx_hash or "").strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="missingPaymentSessionId")

    if not tx_hash:
        raise HTTPException(status_code=400, detail="missingTxHash")

    session = db.scalar(
        select(PaymentSession).where(
            PaymentSession.session_id == session_id,
            PaymentSession.user_id == current_user.user_id,
        )
    )
    if not session:
        raise HTTPException(status_code=404, detail="paymentSessionNotFound")

    if session.status == "paid":
        return {"payment": _session_response(session), "already_paid": True}

    if session.status != "pending":
        raise HTTPException(status_code=400, detail="paymentSessionNotPending")

    now = _utcnow()
    expires_at = _from_db_naive_utc(session.expires_at)

    if expires_at and expires_at <= now:
        session.status = "expired"
        db.add(session)
        db.commit()
        raise HTTPException(status_code=400, detail="paymentSessionExpired")

    duplicate = db.scalar(
        select(PaymentSession).where(
            PaymentSession.tx_hash == tx_hash,
            PaymentSession.status == "paid",
        )
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="txHashAlreadyUsed")

    verifier = get_cardano_payment_verifier()
    result = verifier.verify_payment_tx(
        tx_hash=tx_hash,
        expected_address=session.payment_address_snapshot,
        expected_lovelace=session.amount_snapshot,
        network=session.network_snapshot,
    )

    session.tx_hash = tx_hash
    session.provider = result.provider
    session.provider_response = {
        "ok": result.ok,
        "expected_address": result.expected_address,
        "expected_lovelace": result.expected_lovelace,
        "received_lovelace": result.received_lovelace,
        "error": result.error,
    }

    if not result.ok:
        db.add(session)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail={
                "code": result.error or "paymentVerificationFailed",
                "received_lovelace": result.received_lovelace,
                "expected_lovelace": result.expected_lovelace,
            },
        )

    session.status = "paid"
    session.paid_at = _to_db_naive_utc(now)
    db.add(session)
    db.flush()

    entitlement = _grant_entitlement(
        db,
        user=current_user,
        session=session,
        duration_days=session.duration_days_snapshot,
    )

    db.commit()
    db.refresh(session)
    db.refresh(entitlement)

    return {
        "payment": _session_response(session),
        "entitlement": {
            "entitlement_code": entitlement.entitlement_code,
            "status": entitlement.status,
            "starts_at": _format_utc(entitlement.starts_at),
            "expires_at": _format_utc(entitlement.expires_at),
        },
    }


@router.get("/entitlements/me")
def get_my_entitlements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = _to_db_naive_utc(_utcnow())

    rows = (
        db.query(UserEntitlement)
        .filter(
            UserEntitlement.user_id == current_user.user_id,
            UserEntitlement.status == "active",
            UserEntitlement.starts_at <= now,
            UserEntitlement.expires_at > now,
        )
        .order_by(UserEntitlement.expires_at.desc())
        .all()
    )

    return {
        "entitlements": [
            {
                "entitlement_code": row.entitlement_code,
                "source": row.source,
                "status": row.status,
                "starts_at": _format_utc(row.starts_at),
                "expires_at": _format_utc(row.expires_at),
            }
            for row in rows
        ]
    }
