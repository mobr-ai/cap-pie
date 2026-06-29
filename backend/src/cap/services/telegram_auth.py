import hashlib
import hmac
import json
import os
import time
from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl

from fastapi import HTTPException, Request

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
TELEGRAM_INTERNAL_API_KEY = os.getenv("TELEGRAM_INTERNAL_API_KEY", "")
TELEGRAM_AUTH_MAX_AGE_SECONDS = int(os.getenv("TELEGRAM_AUTH_MAX_AGE_SECONDS", "86400"))


def verify_internal_bot_request(request: Request) -> None:
    supplied = request.headers.get("x-cap-telegram-api-key", "")
    if not TELEGRAM_INTERNAL_API_KEY:
        raise HTTPException(500, detail="telegramInternalApiKeyNotConfigured")
    if not hmac.compare_digest(supplied, TELEGRAM_INTERNAL_API_KEY):
        raise HTTPException(401, detail="invalidTelegramInternalApiKey")


def verify_telegram_webhook_secret(request: Request) -> None:
    supplied = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(500, detail="telegramWebhookSecretNotConfigured")
    if not hmac.compare_digest(supplied, TELEGRAM_WEBHOOK_SECRET):
        raise HTTPException(401, detail="invalidTelegramWebhookSecret")


def _secret_key() -> bytes:
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(500, detail="telegramBotTokenNotConfigured")
    return hmac.new(b"WebAppData", TELEGRAM_BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()


def verify_telegram_init_data(init_data: str) -> dict[str, Any]:
    """
    Verifies Telegram WebApp initData.

    Use this for /telegram/link from the CAP UI or Telegram Mini App.
    It proves Telegram produced the user id.
    """
    if not init_data:
        raise HTTPException(400, detail="missingTelegramInitData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise HTTPException(400, detail="missingTelegramHash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    computed_hash = hmac.new(_secret_key(), data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(401, detail="invalidTelegramSignature")

    auth_date = int(pairs.get("auth_date", "0") or "0")
    if auth_date <= 0 or time.time() - auth_date > TELEGRAM_AUTH_MAX_AGE_SECONDS:
        raise HTTPException(401, detail="telegramAuthExpired")

    raw_user = pairs.get("user")
    if not raw_user:
        raise HTTPException(400, detail="missingTelegramUser")

    try:
        user = json.loads(raw_user)
    except Exception as exc:
        raise HTTPException(400, detail="invalidTelegramUserPayload") from exc

    if not user.get("id"):
        raise HTTPException(400, detail="missingTelegramUserId")

    return {
        "telegram_user_id": int(user["id"]),
        "telegram_username": user.get("username"),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "auth_date": datetime.fromtimestamp(auth_date),
        "raw": user,
    }
