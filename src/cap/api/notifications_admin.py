from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import get_current_admin_user
from cap.database.model import User
from cap.database.session import get_db
from cap.mailing.event_triggers import (
    on_admin_beta_query_created,
    on_admin_beta_registration_created,
    on_admin_query_created,
)
from cap.services.admin_alerts_service import (
    get_beta_query_notification_config,
    get_beta_registration_notification_config,
    # existing
    get_new_user_notification_config,
    get_query_notification_config,
    # NEW (user confirmed)
    get_user_confirmed_notification_config,
    # existing (waitlist)
    get_waitlist_notification_config,
    maybe_notify_admins_new_user,
    maybe_notify_admins_user_confirmed,
    maybe_notify_admins_waitlist,
    update_beta_query_notification_config,
    update_beta_registration_notification_config,
    update_new_user_notification_config,
    update_query_notification_config,
    update_user_confirmed_notification_config,
    update_waitlist_notification_config,
)

router = APIRouter(prefix="/api/v1/admin/notifications", tags=["notifications_admin"])


# ---------- Schemas ----------

class NotificationConfigIn(BaseModel):
    enabled: bool
    recipients: list[EmailStr]


class NotificationConfigOut(BaseModel):
    enabled: bool
    recipients: list[EmailStr]


class NotificationTestIn(BaseModel):
    recipients: list[EmailStr] | None = None


# ---------- New user notifications (existing) ----------

@router.get("/new_user", response_model=NotificationConfigOut)
def get_new_user_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_new_user_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/new_user", response_model=NotificationConfigOut)
def set_new_user_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_new_user_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/new_user/test")
def send_test_new_user_notification(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """
    Trigger a test 'new user' notification.
    """
    try:
        maybe_notify_admins_new_user(
            db=db,
            user=admin,
            source="admin-test",
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail="Error sending test notification.",
        ) from exc

    return {"ok": True}


# ---------- Waitlist notifications (existing) ----------

@router.get("/waitlist", response_model=NotificationConfigOut)
def get_waitlist_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_waitlist_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/waitlist", response_model=NotificationConfigOut)
def set_waitlist_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_waitlist_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/waitlist/test")
def send_test_waitlist_notification(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """
    Trigger a test 'waitlist registration' notification.

    Uses the currently logged-in admin as a fake waitlist entry.
    """
    try:
        maybe_notify_admins_waitlist(
            db=db,
            email=admin.email,
            ref="admin-test",
            language="en",
            source="admin-test",
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail="Error sending waitlist test notification.",
        ) from exc

    return {"ok": True}


# ---------- User confirmed notifications (NEW) ----------

@router.get("/user_confirmed", response_model=NotificationConfigOut)
def get_user_confirmed_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_user_confirmed_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/user_confirmed", response_model=NotificationConfigOut)
def set_user_confirmed_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_user_confirmed_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/user_confirmed/test")
def send_test_user_confirmed_notification(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    """
    Trigger a test 'user confirmed' notification.

    Uses the currently logged-in admin as the confirmed user payload.
    """
    try:
        maybe_notify_admins_user_confirmed(
            db=db,
            user=admin,
            source="admin-test",
        )
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail="Error sending user confirmed test notification.",
        ) from exc

    return {"ok": True}

# ---------- Beta program notifications ----------

@router.get("/beta_registration", response_model=NotificationConfigOut)
def get_beta_registration_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_beta_registration_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/beta_registration", response_model=NotificationConfigOut)
def set_beta_registration_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_beta_registration_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/beta_registration/test")
def send_test_beta_registration_notification(
    payload: NotificationTestIn | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    recipients = list(payload.recipients or []) if payload else []
    if recipients:
        try:
            on_admin_beta_registration_created(
                to=[str(r) for r in recipients],
                language="en",
                beta_email=admin.email or "admin-test@example.com",
                beta_name=admin.display_name or admin.username or "Admin test",
                beta_role="admin-test",
                beta_organization="CAP",
                beta_use_case="Testing beta registration admin notifications.",
                source="admin-test",
            )
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="Error sending beta registration test notification.") from exc
        return {"ok": True, "recipients": [str(r) for r in recipients]}

    try:
        cfg = get_beta_registration_notification_config(db)
        if not cfg.get("recipients"):
            raise HTTPException(status_code=400, detail="notificationRecipientsRequired")

        on_admin_beta_registration_created(
            to=cfg["recipients"],
            language="en",
            beta_email=admin.email or "admin-test@example.com",
            beta_name=admin.display_name or admin.username or "Admin test",
            beta_role="admin-test",
            beta_organization="CAP",
            beta_use_case="Testing beta registration admin notifications.",
            source="admin-test",
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Error sending beta registration test notification.") from exc

    return {"ok": True, "recipients": cfg.get("recipients", [])}


# ---------- Query notifications ----------

@router.get("/query", response_model=NotificationConfigOut)
def get_query_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_query_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/query", response_model=NotificationConfigOut)
def set_query_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_query_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/query/test")
def send_test_query_notification(
    payload: NotificationTestIn | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    recipients = list(payload.recipients or []) if payload else []

    def _send(to_list: list[str]) -> None:
        on_admin_query_created(
            to=to_list,
            language="en",
            query_id=0,
            user_id=admin.user_id,
            user_email=admin.email or "admin-test@example.com",
            username=admin.username or admin.display_name or "Admin test",
            nl_query="How did the top 10 staking pools perform last epoch?",
            detected_language="en",
            succeeded=True,
            total_latency_ms=1200,
            complexity_score=2,
        )

    if recipients:
        try:
            _send([str(r) for r in recipients])
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="Error sending query test notification.") from exc
        return {"ok": True, "recipients": [str(r) for r in recipients]}

    try:
        cfg = get_query_notification_config(db)
        if not cfg.get("recipients"):
            raise HTTPException(status_code=400, detail="notificationRecipientsRequired")
        _send(cfg["recipients"])
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Error sending query test notification.") from exc

    return {"ok": True, "recipients": cfg.get("recipients", [])}

# ---------- Beta-user query notifications ----------

@router.get("/beta_query", response_model=NotificationConfigOut)
def get_beta_query_notifications(
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = get_beta_query_notification_config(db)
    return NotificationConfigOut(**cfg)


@router.put("/beta_query", response_model=NotificationConfigOut)
def set_beta_query_notifications(
    payload: NotificationConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    cfg = update_beta_query_notification_config(
        db,
        enabled=payload.enabled,
        recipients=list(payload.recipients),
    )
    return NotificationConfigOut(**cfg)


@router.post("/beta_query/test")
def send_test_beta_query_notification(
    payload: NotificationTestIn | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
):
    recipients = list(payload.recipients or []) if payload else []

    def _send(to_list: list[str]) -> None:
        on_admin_beta_query_created(
            to=to_list,
            language="en",
            query_id=0,
            user_id=admin.user_id,
            user_email=admin.email or "admin-test@example.com",
            username=admin.username or admin.display_name or "Admin test",
            beta_registration_id=0,
            beta_status="admin-test",
            nl_query="How did registered beta users explore Cardano data today?",
            detected_language="en",
            succeeded=True,
            total_latency_ms=1200,
            complexity_score=2,
        )

    if recipients:
        try:
            _send([str(r) for r in recipients])
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="Error sending beta-query test notification.") from exc
        return {"ok": True, "recipients": [str(r) for r in recipients]}

    try:
        cfg = get_beta_query_notification_config(db)
        if not cfg.get("recipients"):
            raise HTTPException(status_code=400, detail="notificationRecipientsRequired")
        _send(cfg["recipients"])
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Error sending beta-query test notification.") from exc

    return {"ok": True, "recipients": cfg.get("recipients", [])}
