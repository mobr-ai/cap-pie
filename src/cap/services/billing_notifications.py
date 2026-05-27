from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from cap.database.model import BillingNotificationSetting

CHANNEL_EMAIL = "email"
AUDIENCE_USER = "user"

BILLING_NOTIFICATION_DEFAULTS: dict[str, dict[str, Any]] = {
    "payment_session_created": {
        "enabled": False,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when a Cardano payment session is created.",
    },
    "payment_confirmed": {
        "enabled": False,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send a generic payment confirmation email.",
    },
    "payment_failed": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when payment verification fails.",
    },
    "balance_credited": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when CAP Balance is credited.",
    },
    "premium_activated": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Premium access is activated.",
    },
    "premium_extended": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Premium access is extended.",
    },
    "support_contribution_confirmed": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when a support contribution is confirmed.",
    },
    "auto_renew_enabled": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Balance-funded auto-renewal is enabled.",
    },
    "auto_renew_disabled": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Balance-funded auto-renewal is disabled.",
    },
    "auto_renew_succeeded": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Balance-funded auto-renewal succeeds.",
    },
    "auto_renew_failed": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when Balance-funded auto-renewal fails.",
    },
    "admin_premium_granted": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when an admin grants Premium access.",
    },
    "admin_premium_revoked": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when an admin revokes Premium access.",
    },
    "admin_balance_adjusted": {
        "enabled": True,
        "audience": AUDIENCE_USER,
        "channel": CHANNEL_EMAIL,
        "description": "Send an email when an admin adjusts CAP Balance.",
    },
}


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _default_for(event_code: str) -> dict[str, Any]:
    defaults = BILLING_NOTIFICATION_DEFAULTS.get(event_code, {})
    return {
        "event_code": event_code,
        "enabled": bool(defaults.get("enabled", True)),
        "audience": defaults.get("audience") or AUDIENCE_USER,
        "channel": defaults.get("channel") or CHANNEL_EMAIL,
        "description": defaults.get("description") or "Billing notification setting.",
    }


def billing_notification_setting_payload(row: BillingNotificationSetting) -> dict[str, Any]:
    return {
        "event_code": row.event_code,
        "enabled": bool(row.enabled),
        "audience": row.audience,
        "channel": row.channel,
        "description": row.description,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by_user_id": row.updated_by_user_id,
    }


def get_billing_notification_setting(
    db: Session,
    event_code: str,
    *,
    audience: str = AUDIENCE_USER,
    channel: str = CHANNEL_EMAIL,
) -> BillingNotificationSetting | None:
    return db.scalar(
        select(BillingNotificationSetting).where(
            BillingNotificationSetting.event_code == event_code,
            BillingNotificationSetting.audience == audience,
            BillingNotificationSetting.channel == channel,
        )
    )


def ensure_billing_notification_settings(db: Session) -> list[BillingNotificationSetting]:
    rows: list[BillingNotificationSetting] = []
    now = _utcnow_naive()

    for event_code in BILLING_NOTIFICATION_DEFAULTS:
        defaults = _default_for(event_code)
        row = get_billing_notification_setting(
            db,
            event_code,
            audience=defaults["audience"],
            channel=defaults["channel"],
        )
        if row is None:
            row = BillingNotificationSetting(
                event_code=defaults["event_code"],
                enabled=defaults["enabled"],
                audience=defaults["audience"],
                channel=defaults["channel"],
                description=defaults["description"],
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            db.flush()
        rows.append(row)

    return rows


def list_billing_notification_settings(db: Session) -> list[dict[str, Any]]:
    rows = ensure_billing_notification_settings(db)
    by_code = {row.event_code: row for row in rows}
    return [
        billing_notification_setting_payload(by_code[event_code])
        for event_code in BILLING_NOTIFICATION_DEFAULTS
        if event_code in by_code
    ]


def update_billing_notification_setting(
    db: Session,
    event_code: str,
    *,
    enabled: bool,
    updated_by_user_id: int | None = None,
) -> BillingNotificationSetting:
    if event_code not in BILLING_NOTIFICATION_DEFAULTS:
        raise ValueError("unsupportedBillingNotificationEvent")

    defaults = _default_for(event_code)
    row = get_billing_notification_setting(
        db,
        event_code,
        audience=defaults["audience"],
        channel=defaults["channel"],
    )

    now = _utcnow_naive()
    if row is None:
        row = BillingNotificationSetting(
            event_code=defaults["event_code"],
            audience=defaults["audience"],
            channel=defaults["channel"],
            description=defaults["description"],
            created_at=now,
        )

    row.enabled = bool(enabled)
    row.description = row.description or defaults["description"]
    row.updated_at = now
    row.updated_by_user_id = updated_by_user_id
    db.add(row)
    db.flush()
    return row


def is_billing_notification_enabled(
    db: Session,
    event_code: str,
    *,
    default: bool | None = None,
    audience: str = AUDIENCE_USER,
    channel: str = CHANNEL_EMAIL,
) -> bool:
    row = get_billing_notification_setting(
        db,
        event_code,
        audience=audience,
        channel=channel,
    )
    if row is not None:
        return bool(row.enabled)

    if default is not None:
        return bool(default)

    defaults = _default_for(event_code)
    return bool(defaults["enabled"])
