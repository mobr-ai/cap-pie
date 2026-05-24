# cap/api/demo/auth.py

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import (
    _decode,
    _extract_token,
    _extract_user_id,
    bearer_scheme,
)
from cap.database.model import User
from cap.database.session import get_db


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User | None:
    token = _extract_token(request, creds)
    if not token:
        return None

    try:
        payload = _decode(token)
        user_id = _extract_user_id(payload)
        return db.get(User, user_id)
    except Exception:
        return None
