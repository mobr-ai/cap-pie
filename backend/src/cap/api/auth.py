# cap/src/cap/api/auth.py
import hashlib, os, secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import text

from cap.database.session import get_db
from cap.database.model import User, CardanoAuthChallenge
from cap.mailing.event_triggers import on_user_access_granted
from cap.services.admin_alerts_service import maybe_notify_admins_new_user
from cap.core.cardano_signature import verify_cardano_data_signature
from cap.core.security import (
    hash_password,
    verify_password,
    make_access_token,
    generate_unique_username,
    new_confirmation_token,
)
from cap.core.google_oauth import get_userinfo_from_access_token_or_idtoken

# --- Event triggers (mailer) ---
try:
    from cap.mailing.event_triggers import (
        on_user_registered,        # existing in CAP (confirm-your-email)
        on_waiting_list_joined,    # notify user joined waiting list
        on_confirmation_resent,    # notify user that a new confirmation email was sent
        on_user_confirmed,         # notify / log that user confirmed their email
        on_oauth_login,            # notify / log OAuth login
        on_wallet_login,           # notify / log Cardano wallet login
    )
except Exception:
    # Fallbacks to avoid breaking imports if optional triggers aren't defined yet.
    def on_user_registered(*args, **kwargs): pass
    def on_waiting_list_joined(*args, **kwargs): pass
    def on_confirmation_resent(*args, **kwargs): pass
    def on_user_confirmed(*args, **kwargs): pass
    def on_oauth_login(*args, **kwargs): pass
    def on_wallet_login(*args, **kwargs): pass


route_prefix = "/api/v1"
router = APIRouter(prefix=route_prefix, tags=["auth"])

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")  # e.g. "https://cap.mobr.ai"

def _stable_base_url(request: Request) -> str:
    """Prefer PUBLIC_BASE_URL to avoid localhost/0.0.0.0 links; fallback to request base_url."""
    if PUBLIC_BASE_URL:
        return PUBLIC_BASE_URL.rstrip("/")
    return str(request.base_url).rstrip("/")

def _make_referral_link(base_url: str, user_id: int | None) -> str:
    """Build /signup?ref=u<user_id> or plain /signup if absent."""
    if user_id:
        return f"{base_url}/signup?ref=u{user_id}"
    return f"{base_url}/signup"


# ---- Pydantic shapes ----
class ResendSetupLinkIn(BaseModel):
    email: EmailStr
    language: str | None = "en"


class WalletClaimEmailIn(BaseModel):
    user_id: int
    wallet_address: str
    email: EmailStr
    ref: str | None = ""
    language: str | None = "en"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    language: str | None = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class ResendIn(BaseModel):
    email: EmailStr
    language: str | None = "en"


class GoogleIn(BaseModel):
    token: str
    token_type: str | None = None
    remember_me: bool = False
    language: str | None = "en"
    ref: str | None = ""


class CardanoIn(BaseModel):
    address: str
    remember_me: bool = True
    language: str | None = "en"
    ref: str | None = ""


class CardanoChallengeIn(BaseModel):
    address: str
    address_hex: str | None = None
    wallet_name: str | None = None
    network_id: int | None = None
    language: str | None = "en"
    ref: str | None = ""


class CardanoVerifyIn(BaseModel):
    address: str
    address_hex: str | None = None
    challenge_id: str
    message: str
    signature: str
    key: str
    wallet_name: str | None = None
    remember_me: bool = True
    language: str | None = "en"
    ref: str | None = ""


class SetPasswordIn(BaseModel):
    token: str
    password: str
    remember_me: bool = False



def _ensure_waitlist_row(
    db: Session, email: str, ref: str = "", language: str = "en"
) -> bool:
    """
    Insert into waiting_list if not exists.
    Returns True if inserted, False if already existed / skipped.
    """
    e = (email or "").strip().lower()
    if not e:
        return False

    exists = db.execute(
        text("SELECT 1 FROM waiting_list WHERE email = :e"),
        {"e": e},
    ).first()
    if exists:
        return False

    db.execute(
        text("INSERT INTO waiting_list (email, ref, language) VALUES (:e, :r, :l)"),
        {"e": e, "r": ref or "", "l": (language or "en").strip().lower()},
    )
    db.commit()
    return True


# ---- Auth: Claim e-mail (for wallet) ----
@router.post("/auth/wallet_claim_email")
def wallet_claim_email(
    data: WalletClaimEmailIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == data.user_id).first()
    if not user:
        raise HTTPException(404, detail="userNotFound")

    if not user.wallet_address or user.wallet_address != data.wallet_address:
        raise HTTPException(400, detail="walletMismatch")

    email_norm = (str(data.email or "").strip().lower()) if data.email else ""
    if not email_norm:
        raise HTTPException(400, detail="invalidEmailFormat")

    # prevent stealing an email already owned by another user
    existing = db.query(User).filter(User.email == email_norm).first()
    if existing and existing.user_id != user.user_id:
        raise HTTPException(400, detail="userExistsError")

    # Attach email
    user.email = email_norm
    db.commit()

    inserted = _ensure_waitlist_row(
        db,
        email=email_norm,
        ref=(data.ref or ""),
        language=(data.language or "en"),
    )

    # Trigger waitlist email ONLY when this is a new waitlist entry
    if inserted:
        try:
            base_url = _stable_base_url(request)
            referral_link = _make_referral_link(base_url, getattr(user, "user_id", None))

            on_waiting_list_joined(
                to=[email_norm],
                language=(data.language or "en"),
                referral_link=referral_link,
            )
        except Exception as mail_err:
            print(f"[WAITLIST] Mail trigger failed for {email_norm}: {mail_err}")

    # Return status that lets frontend show success vs already
    if not inserted:
        raise HTTPException(418, detail="alreadyOnList")

    return {"status": "waitlisted", "id": user.user_id, "email": user.email}


# ---- Auth: Register (unconfirmed) ----
@router.post("/register")
def register(data: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if not data.email or not data.password:
        raise HTTPException(400, detail="registerError")

    user = db.query(User).filter(User.email == data.email).first()
    if user:
        if user.google_id:
            raise HTTPException(400, detail="oauthExistsError")
        raise HTTPException(400, detail="userExistsError")

    token = new_confirmation_token()
    email_local = data.email.split("@")[0]

    new_user = User(
        email=data.email,
        username=generate_unique_username(db, User, preferred=email_local),
        password_hash=hash_password(data.password),
        confirmation_token=token,
        is_confirmed=False,
        is_admin=False,
    )
    db.add(new_user)
    db.commit()

    # Notify admins (if configured)
    maybe_notify_admins_new_user(db, new_user, source="password")

    # Build confirmation link
    base = str(request.base_url).rstrip("/")
    activation_link = f"{base}/{route_prefix}/confirm/{token}"

    # Send confirmation email
    on_user_registered(
        to=[data.email],
        language=(data.language or "en"),
        username=new_user.username or data.email.split("@")[0],
        activation_link=activation_link,
    )

    return {"redirect": "/login?confirmed=false"}


# ---- Confirm email ----
@router.get("/confirm/{token}")
def confirm_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.confirmation_token == token).first()
    if not user:
        raise HTTPException(400, detail="confirmationError")

    user.is_confirmed = True
    user.confirmation_token = None
    db.commit()

    # Optional: fire a "user confirmed" trigger (logging/notification)
    on_user_confirmed(to=[user.email] if user.email else [], language="en")

    return RedirectResponse(url="/login?confirmed=true")


# ---- Re-send setup link in case it expires ----
@router.post("/auth/resend_setup_link")
def resend_setup_link(data: ResendSetupLinkIn, request: Request, db: Session = Depends(get_db)):
    email_norm = (str(data.email or "").strip().lower()) if data.email else ""
    if not email_norm:
        raise HTTPException(400, detail="invalidEmailFormat")

    user = db.query(User).filter(User.email == email_norm).first()
    if not user:
        raise HTTPException(404, detail="userNotFound")

    # Must already be approved
    if not bool(user.is_confirmed):
        raise HTTPException(403, detail="accessNotGranted")

    # If Google user, they should use Google login
    if user.google_id:
        raise HTTPException(400, detail="oauthExistsError")

    # If password is already set, they can just login
    if user.password_hash:
        raise HTTPException(400, detail="passwordAlreadySet")

    # Create a fresh token (reusing existing generator)
    token = new_confirmation_token()
    user.confirmation_token = token
    db.commit()
    db.refresh(user)

    base_url = _stable_base_url(request)
    setup_url = f"{base_url}/login?state=setpass&token={token}"

    # Send the same "access granted" email but with setup_url CTA
    on_user_access_granted(
        to=[email_norm],
        language=(data.language or "en"),
        app_url=base_url,
        setup_url=setup_url,
    )

    return {"status": "sent"}

# ---- Define user password for approved accounts ----
@router.post("/auth/set_password")
def set_password(data: SetPasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.confirmation_token == data.token).first()
    if not user:
        raise HTTPException(400, detail="invalidOrExpiredToken")

    # Must be approved already (pre-alpha gate)
    if not user.is_confirmed:
        raise HTTPException(403, detail="accessNotGranted")

    # Block if this account is Google-based
    if user.google_id:
        raise HTTPException(400, detail="oauthExistsError")

    # Minimal password validation
    pw = (data.password or "").strip()
    if len(pw) < 8:
        raise HTTPException(400, detail="weakPassword")

    user.password_hash = hash_password(pw)
    user.confirmation_token = None
    db.commit()
    db.refresh(user)

    token = make_access_token(str(user.user_id), remember=data.remember_me)
    return {
        "id": user.user_id,
        "username": user.username,
        "wallet_address": user.wallet_address,
        "display_name": user.display_name,
        "email": user.email,
        "avatar": user.avatar,
        "settings": user.settings,
        "is_admin": getattr(user, "is_admin", False),
        "access_token": token,
    }


# ---- Resend confirmation ----
@router.post("/resend_confirmation")
def resend_confirmation(data: ResendIn, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(404, detail="userNotFound")

    if user.is_confirmed:
        raise HTTPException(400, detail="alreadyConfirmed")

    token = new_confirmation_token()
    user.confirmation_token = token
    db.commit()

    # You may choose to send the full "confirm your email" again here:
    # on_user_registered([...]) — or use a lighter "confirmation resent" notice:
    on_confirmation_resent(to=[data.email], language=(data.language or "en"))

    return {"message": "resent"}


# ---- Login (email/password) ----
@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    email_norm = (str(data.email or "").strip().lower()) if data.email else ""
    if not email_norm:
        raise HTTPException(401, detail="loginError")

    user = db.query(User).filter(User.email == email_norm).first()
    if not user:
        raise HTTPException(401, detail="loginError")

    if not user.is_confirmed:
        raise HTTPException(403, detail="confirmationError")

    # If user has no password set, they cannot use password login.
    # This also covers google-only accounts (unless you later add "set password" for them).
    if not user.password_hash:
        if user.google_id:
            raise HTTPException(400, detail="oauthExistsError")
        raise HTTPException(403, detail="passwordNotSet")

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(401, detail="loginError")

    token = make_access_token(str(user.user_id), remember=data.remember_me)

    resp = {
        "id": user.user_id,
        "username": user.username,
        "wallet_address": user.wallet_address,
        "display_name": user.display_name,
        "email": user.email,
        "avatar": user.avatar,
        "settings": user.settings,
        "is_admin": getattr(user, "is_admin", False),
        "access_token": token,
    }

    # If linked with Google, include a friendly notice for the frontend
    if user.google_id:
        resp["notice"] = "googleLinked"

    return resp


# ---- Google OAuth (access_token from client) ----
@router.post("/auth/google")
def auth_google(data: GoogleIn, request: Request, db: Session = Depends(get_db)):
    try:
        info = get_userinfo_from_access_token_or_idtoken(
            data.token, getattr(data, "token_type", None)
        )

        google_id = info["sub"]
        email = (info.get("email") or "").strip().lower()
        display_name = info.get("name") or ""
        avatar = info.get("picture", "")

        if not email:
            raise HTTPException(400, detail="missingGoogleEmail")

        # 1) Prefer lookup by google_id
        user = db.query(User).filter(User.google_id == google_id).first()

        # 2) If not found, try to link to an existing user by email
        if not user:
            user = db.query(User).filter(User.email == email).first()

            if user:
                # If this email is already bound to a different Google account, block
                if user.google_id and user.google_id != google_id:
                    raise HTTPException(400, detail="oauthExistsError")

                # Link this existing account to Google
                user.google_id = google_id

                # Keep profile fields fresh (don’t overwrite if you don’t want to)
                if display_name and not user.display_name:
                    user.display_name = display_name
                if avatar and not user.avatar:
                    user.avatar = avatar

                # Ensure username exists
                if not user.username:
                    user.username = generate_unique_username(
                        db, User, preferred=(email.split("@")[0] or display_name)
                    )

                db.commit()
            else:
                # 3) No user by google_id or email -> create
                username = generate_unique_username(
                    db, User, preferred=(email.split("@")[0] or display_name)
                )
                user = User(
                    google_id=google_id,
                    email=email,
                    username=username,
                    display_name=display_name,
                    avatar=avatar,
                    is_confirmed=False,  # do not auto-confirm
                    is_admin=False,
                )
                db.add(user)
                db.commit()
                maybe_notify_admins_new_user(db, user, source="google")

        else:
            # Existing google_id user: keep profile fields fresh
            if email and not user.email:
                user.email = email
            if display_name and not user.display_name:
                user.display_name = display_name
            if avatar and not user.avatar:
                user.avatar = avatar
            db.commit()

        # If not confirmed, put on waitlist and do not issue token
        if not bool(user.is_confirmed):
            inserted = _ensure_waitlist_row(
                db,
                email=email,
                ref=(data.ref or ""),
                language=(data.language or "en"),
            )

            if inserted:
                try:
                    base_url = _stable_base_url(request)
                    referral_link = _make_referral_link(base_url, getattr(user, "user_id", None))
                    on_waiting_list_joined(
                        to=[email],
                        language=(data.language or "en"),
                        referral_link=referral_link,
                    )
                except Exception as mail_err:
                    print(f"[WAITLIST] Mail trigger failed for {email}: {mail_err}")

            return {"status": "pending_confirmation", "id": user.user_id, "email": user.email}

        # Confirmed users can login normally
        token = make_access_token(str(user.user_id), remember=data.remember_me)
        on_oauth_login(to=[email], language=(data.language or "en"), provider="Google")

        return {
            "id": user.user_id,
            "username": user.username,
            "wallet_address": user.wallet_address,
            "display_name": user.display_name,
            "email": user.email,
            "avatar": user.avatar,
            "settings": user.settings,
            "is_admin": getattr(user, "is_admin", False),
            "access_token": token,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, detail=str(e))


# ---- Cardano wallet auth with signed CIP-30 / CIP-8 challenge ----

def _hex_encode_utf8(value: str) -> str:
    return (value or "").encode("utf-8").hex()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)



def _format_utc(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()

def _to_db_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)

def _create_or_get_cardano_user(db: Session, address: str) -> User:
    user = db.query(User).filter(User.wallet_address == address).first()

    if user:
        return user

    suffix = int(hashlib.sha256(address.encode()).hexdigest(), 16) % 1_000_000
    username = f"cardano_user{suffix}"

    if db.query(User).filter(User.username == username).first():
        username = generate_unique_username(db, User, preferred=username)

    display_name = f"{address[:8]}...{address[-5:]}"

    user = User(
        username=username,
        wallet_address=address,
        display_name=display_name,
        is_confirmed=False,
        is_admin=False,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    maybe_notify_admins_new_user(db, user, source="cardano")

    return user


def _cardano_auth_response(user: User, *, remember_me: bool, language: str = "en"):
    if not bool(user.is_confirmed):
        return {
            "status": "pending_confirmation",
            "id": user.user_id,
            "wallet_address": user.wallet_address,
        }

    token = make_access_token(str(user.user_id), remember=remember_me)

    if user.email:
        on_wallet_login(
            to=[user.email],
            language=(language or "en"),
            wallet_address=user.wallet_address,
        )

    return {
        "id": user.user_id,
        "username": user.username,
        "wallet_address": user.wallet_address,
        "display_name": user.display_name,
        "email": user.email,
        "avatar": user.avatar,
        "settings": user.settings,
        "is_admin": getattr(user, "is_admin", False),
        "access_token": token,
    }


def _build_cardano_login_message(
    *,
    base_url: str,
    address: str,
    challenge_id: str,
    nonce: str,
    issued_at: datetime,
    expires_at: datetime,
) -> str:
    return "\n".join(
        [
            "CAP Cardano Login",
            "",
            f"Domain: {base_url}",
            f"Address: {address}",
            f"Challenge ID: {challenge_id}",
            f"Nonce: {nonce}",
            f"Issued At: {_format_utc(issued_at)}",
            f"Expires At: {_format_utc(expires_at)}",
            "",
            "Only sign this message if you are logging into CAP.",
        ]
    )


@router.post("/auth/cardano/challenge")
def cardano_auth_challenge(
    data: CardanoChallengeIn,
    request: Request,
    db: Session = Depends(get_db),
):
    address = (data.address or "").strip()

    if not address:
        raise HTTPException(400, detail="missingWalletAddress")

    now = _utcnow()
    expires_at = now + timedelta(minutes=10)

    challenge_id = f"cardano_chal_{secrets.token_urlsafe(24)}"
    nonce = secrets.token_urlsafe(32)

    base_url = _stable_base_url(request)

    message = _build_cardano_login_message(
        base_url=base_url,
        address=address,
        challenge_id=challenge_id,
        nonce=nonce,
        issued_at=now,
        expires_at=_to_db_naive_utc(expires_at),
    )

    message_hex = _hex_encode_utf8(message)

    challenge = CardanoAuthChallenge(
        challenge_id=challenge_id,
        wallet_address=address,
        wallet_name=(data.wallet_name or None),
        nonce=nonce,
        message=message,
        message_hex=message_hex,
        status="pending",
        created_at=now.replace(tzinfo=None),
        expires_at=_to_db_naive_utc(expires_at),
    )

    db.add(challenge)
    db.commit()

    return {
        "challenge_id": challenge_id,
        "message": message,
        "message_hex": message_hex,
        "expires_at": _format_utc(expires_at),
    }


@router.post("/auth/cardano/verify")
def cardano_auth_verify(
    data: CardanoVerifyIn,
    db: Session = Depends(get_db),
):
    address = (data.address or "").strip()
    challenge_id = (data.challenge_id or "").strip()

    if not address:
        raise HTTPException(400, detail="missingWalletAddress")

    if not challenge_id:
        raise HTTPException(400, detail="missingChallengeId")

    challenge = (
        db.query(CardanoAuthChallenge)
        .filter(CardanoAuthChallenge.challenge_id == challenge_id)
        .first()
    )

    if not challenge:
        raise HTTPException(404, detail="challengeNotFound")

    if challenge.status != "pending":
        raise HTTPException(400, detail="challengeAlreadyUsed")

    now = _utcnow()
    expires_at = challenge.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        challenge.status = "expired"
        db.add(challenge)
        db.commit()
        raise HTTPException(400, detail="challengeExpired")

    if challenge.wallet_address != address:
        raise HTTPException(400, detail="walletMismatch")

    if challenge.message != data.message:
        raise HTTPException(400, detail="messageMismatch")

    verification = verify_cardano_data_signature(
        address=address,
        message=challenge.message,
        signature=data.signature,
        key=data.key,
    )

    if not verification.ok:
        raise HTTPException(401, detail=verification.error or "invalidSignature")

    challenge.status = "used"
    challenge.used_at = now.replace(tzinfo=None)
    db.add(challenge)
    db.commit()

    user = _create_or_get_cardano_user(db, address)

    return _cardano_auth_response(
        user,
        remember_me=data.remember_me,
        language=(data.language or "en"),
    )


# ---- Cardano wallet auth legacy fallback, disabled by default ----
@router.post("/auth/cardano")
def cardano_auth(data: CardanoIn, db: Session = Depends(get_db)):
    if os.getenv("ALLOW_LEGACY_CARDANO_AUTH", "false").strip().lower() != "true":
        raise HTTPException(410, detail="cardanoSignatureRequired")

    address = (data.address or "").strip()

    if not address:
        raise HTTPException(400, detail="missingWalletAddress")

    user = _create_or_get_cardano_user(db, address)

    return _cardano_auth_response(
        user,
        remember_me=data.remember_me,
        language=(data.language or "en"),
    )
