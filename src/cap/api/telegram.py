import json
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from cap.core.auth_dependencies import get_current_user_unconfirmed
from cap.database.model import TelegramAccount, TelegramChatBinding, TelegramRenderedImage, User
from cap.database.session import get_db
from cap.services.billing_access import (
    BillingAccessDenied,
    check_nl_query_access,
    consume_nl_query_success,
)
from cap.services.nl_service import query_with_stream_response
from cap.services.telegram_auth import (
    verify_internal_bot_request,
    verify_telegram_init_data,
    verify_telegram_webhook_secret,
)
from cap.services.telegram_chart_renderer import TELEGRAM_RENDER_DIR, render_telegram_image

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


class TelegramLinkRequest(BaseModel):
    init_data: str = Field(..., min_length=10)


class TelegramQueryRequest(BaseModel):
    telegram_user_id: int
    telegram_chat_id: int | None = None
    chat_type: str | None = None
    chat_title: str | None = None
    query: str = Field(..., min_length=1, max_length=1000)
    context: str | None = None


class TelegramWebhookRequest(BaseModel):
    update: dict[str, Any]


def _extract_text_and_kv(chunks: list[str]) -> tuple[str, dict[str, Any] | None]:
    text_parts: list[str] = []
    kv_lines: list[str] = []
    collecting_kv = False

    for raw in chunks:
        value = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)

        for line in value.splitlines():
            s = line.strip()

            if not s:
                continue

            if s.startswith("status:"):
                continue

            if s.startswith("kv_results:"):
                collecting_kv = True
                rest = s[len("kv_results:"):].strip()
                if rest:
                    kv_lines.append(rest)
                continue

            if "_kv_results_end_" in s:
                collecting_kv = False
                continue

            if s in {"[DONE]", "data: [DONE]", "data:[DONE]"}:
                continue

            if collecting_kv:
                kv_lines.append(line)
            else:
                text_parts.append(line)

    answer = "".join(text_parts).strip()

    kv = None
    raw_kv = "\n".join(kv_lines).strip()
    if raw_kv:
        try:
            kv = json.loads(raw_kv)
        except Exception:
            kv = None

    return answer, kv


async def _run_telegram_query(
    *,
    db: Session,
    cap_user: User,
    telegram_user_id: int,
    telegram_chat_id: int | None,
    query: str,
    context: str | None,
) -> dict[str, Any]:
    try:
        check_nl_query_access(db, cap_user)
    except BillingAccessDenied as exc:
        raise HTTPException(status_code=402, detail=exc.payload) from exc

    chunks: list[str] = []
    async for chunk in query_with_stream_response(
        query=query,
        context=context,
        db=db,
        user=cap_user,
        conversation_history=[],
    ):
        chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk))

    answer, kv = _extract_text_and_kv(chunks)

    image = None
    if kv:
        image = render_telegram_image(
            db=db,
            cap_user=cap_user,
            telegram_user_id=telegram_user_id,
            telegram_chat_id=telegram_chat_id,
            kv_results=kv,
            absolute=True,
        )

    if answer:
        consume_nl_query_success(db, cap_user)

    return {
        "answer": answer or "I could not generate a text answer.",
        "image": image,
        "telegram": {
            "send_as": "photo" if image else "message",
            "parse_mode": "HTML",
        },
    }


@router.post("/link")
def link_telegram_account(
    data: TelegramLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_unconfirmed),
):
    """
    Called from authenticated CAP UI / Telegram Mini App.
    Binds the real Telegram user id to the already-authenticated CAP user.
    """
    tg = verify_telegram_init_data(data.init_data)

    existing = (
        db.query(TelegramAccount)
        .filter(TelegramAccount.telegram_user_id == tg["telegram_user_id"])
        .first()
    )
    if existing and existing.cap_user_id != current_user.user_id:
        raise HTTPException(409, detail="telegramUserAlreadyLinked")

    existing_for_cap = (
        db.query(TelegramAccount)
        .filter(TelegramAccount.cap_user_id == current_user.user_id)
        .first()
    )
    if existing_for_cap and existing_for_cap.telegram_user_id != tg["telegram_user_id"]:
        raise HTTPException(409, detail="capUserAlreadyLinkedToDifferentTelegram")

    obj = existing or existing_for_cap or TelegramAccount(
        telegram_user_id=tg["telegram_user_id"],
        cap_user_id=current_user.user_id,
    )

    obj.telegram_user_id = tg["telegram_user_id"]
    obj.cap_user_id = current_user.user_id
    obj.telegram_username = tg.get("telegram_username")
    obj.first_name = tg.get("first_name")
    obj.last_name = tg.get("last_name")
    obj.auth_date = tg.get("auth_date")

    db.add(obj)
    db.commit()

    return {
        "status": "linked",
        "telegram_user_id": obj.telegram_user_id,
        "cap_user_id": obj.cap_user_id,
    }


@router.post("/query")
async def query_from_telegram_bot(
    data: TelegramQueryRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Called by your Telegram bot backend.
    Authentication is server-to-server via x-cap-telegram-api-key.
    The telegram_user_id must come from Telegram's update.from.id, not from user text.
    """
    verify_internal_bot_request(request)

    account = (
        db.query(TelegramAccount)
        .filter(TelegramAccount.telegram_user_id == data.telegram_user_id)
        .first()
    )
    if not account:
        raise HTTPException(403, detail="telegramAccountNotLinked")

    cap_user = db.query(User).filter(User.user_id == account.cap_user_id).first()
    if not cap_user:
        raise HTTPException(404, detail="capUserNotFound")

    if data.telegram_chat_id is not None:
        binding = (
            db.query(TelegramChatBinding)
            .filter(TelegramChatBinding.telegram_chat_id == data.telegram_chat_id)
            .first()
        )
        if not binding:
            binding = TelegramChatBinding(
                telegram_chat_id=data.telegram_chat_id,
                chat_type=data.chat_type or "unknown",
                title=data.chat_title,
                created_by_telegram_user_id=data.telegram_user_id,
                default_cap_user_id=cap_user.user_id,
            )
        else:
            binding.chat_type = data.chat_type or binding.chat_type
            binding.title = data.chat_title or binding.title
            binding.updated_at = datetime.now()

        db.add(binding)
        db.commit()

        if not binding.is_enabled:
            raise HTTPException(403, detail="telegramChatDisabled")

    return await _run_telegram_query(
        db=db,
        cap_user=cap_user,
        telegram_user_id=data.telegram_user_id,
        telegram_chat_id=data.telegram_chat_id,
        query=data.query,
        context=data.context,
    )


@router.post("/webhook")
async def telegram_webhook(
    data: TelegramWebhookRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Optional direct Telegram webhook receiver.
    If you keep a separate bot service, you do not need this route.
    """
    verify_telegram_webhook_secret(request)

    message = data.update.get("message") or data.update.get("channel_post") or {}
    sender = message.get("from") or {}
    chat = message.get("chat") or {}
    text = (message.get("text") or "").strip()

    if not sender.get("id") or not text:
        return {"status": "ignored"}

    account = (
        db.query(TelegramAccount)
        .filter(TelegramAccount.telegram_user_id == int(sender["id"]))
        .first()
    )
    if not account:
        return {
            "status": "unlinked",
            "answer": "Please link your Telegram account to CAP first.",
        }

    cap_user = db.query(User).filter(User.user_id == account.cap_user_id).first()
    if not cap_user:
        return {"status": "error", "answer": "CAP user not found."}

    return await _run_telegram_query(
        db=db,
        cap_user=cap_user,
        telegram_user_id=int(sender["id"]),
        telegram_chat_id=int(chat["id"]) if chat.get("id") is not None else None,
        query=text,
        context=None,
    )


@router.get("/image/{image_id}")
def get_telegram_image(
    image_id: str,
    t: str,
    request: Request,
    db: Session = Depends(get_db),
):
    obj = db.query(TelegramRenderedImage).filter(TelegramRenderedImage.id == image_id).first()
    if not obj:
        raise HTTPException(404, detail="notFound")

    if not secrets.compare_digest(obj.access_token or "", t or ""):
        raise HTTPException(404, detail="notFound")

    if obj.expires_at <= datetime.now():
        raise HTTPException(404, detail="expired")

    file_path = (TELEGRAM_RENDER_DIR / obj.storage_path).resolve()
    try:
        file_path.relative_to(TELEGRAM_RENDER_DIR)
    except Exception as exc:
        raise HTTPException(500, detail="invalidStoragePath") from exc

    if not file_path.exists():
        raise HTTPException(404, detail="notFound")

    inm = request.headers.get("if-none-match")
    if inm and obj.etag and inm.strip('"') == obj.etag:
        return Response(status_code=304, headers={"ETag": obj.etag})

    return FileResponse(
        path=str(file_path),
        media_type=obj.mime,
        headers={
            "ETag": obj.etag,
            "Cache-Control": "public, max-age=172800",
        },
        filename=Path(obj.storage_path).name,
    )
