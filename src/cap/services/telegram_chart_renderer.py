import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.graph_objects as go
from PIL import Image, ImageEnhance

from cap.database.model import TelegramRenderedImage, User

TELEGRAM_RENDER_DIR = Path(os.getenv("TELEGRAM_RENDER_DIR", "/var/lib/cap/telegram-renders")).resolve()
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "http://localhost:8000").rstrip("/")
CAP_LOGO_PATH = os.getenv("CAP_LOGO_PATH", "")
IMAGE_TTL_DAYS = int(os.getenv("TELEGRAM_RENDER_TTL_DAYS", "2"))


def _ensure_dir() -> None:
    TELEGRAM_RENDER_DIR.mkdir(parents=True, exist_ok=True)


def _watermark_png(image_path: Path) -> None:
    if not CAP_LOGO_PATH:
        return

    logo_path = Path(CAP_LOGO_PATH)
    if not logo_path.exists():
        return

    base = Image.open(image_path).convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")

    max_w = int(base.width * 0.55)
    ratio = max_w / logo.width
    logo = logo.resize((max_w, int(logo.height * ratio)))

    alpha = logo.getchannel("A")
    alpha = ImageEnhance.Brightness(alpha).enhance(0.08)
    logo.putalpha(alpha)

    x = (base.width - logo.width) // 2
    y = (base.height - logo.height) // 2

    layer = Image.new("RGBA", base.size, (255, 255, 255, 0))
    layer.paste(logo, (x, y), logo)

    out = Image.alpha_composite(base, layer).convert("RGB")
    out.save(image_path, "PNG", optimize=True)


def _layout(fig: go.Figure, title: str | None = None) -> go.Figure:
    fig.update_layout(
        title=title or "",
        width=1200,
        height=760,
        margin={"l": 70, "r": 50, "t": 90, "b": 80},
        font={"size": 18},
        paper_bgcolor="white",
        plot_bgcolor="white",
    )
    return fig


def _table_to_dataframe(vega: dict[str, Any]) -> pd.DataFrame:
    columns = vega.get("_columns") or []
    values = vega.get("values") or []

    if not values:
        context = vega.get("context") or {}
        return pd.DataFrame([context]) if context else pd.DataFrame()

    max_len = max(len(col.get("values", [])) for col in values)
    rows = []
    for i in range(max_len):
        row = {}
        for idx, col in enumerate(values):
            label = columns[idx] if idx < len(columns) else f"col{idx + 1}"
            col_values = col.get("values", [])
            row[label] = col_values[i] if i < len(col_values) else ""
        rows.append(row)

    return pd.DataFrame(rows)


def render_telegram_image(
    *,
    db,
    cap_user: User,
    telegram_user_id: int,
    telegram_chat_id: int | None,
    kv_results: dict[str, Any],
    absolute: bool = True,
) -> dict[str, Any] | None:
    """
    Renders table/bar/line/scatter/bubble/pie/heatmap/treemap to PNG.
    Returns a short-lived URL that the bot can send as photo/document.
    """
    result_type = kv_results.get("result_type") or kv_results.get("type") or "text"
    vega = kv_results.get("vega") or kv_results.get("config") or kv_results

    if result_type == "text":
        return None

    fig = _figure_from_vega(result_type, vega, kv_results.get("title"))

    _ensure_dir()
    image_id = str(uuid.uuid4())
    filename = f"{image_id}.png"
    path = TELEGRAM_RENDER_DIR / filename

    fig.write_image(str(path), format="png", scale=2)
    _watermark_png(path)

    raw = path.read_bytes()
    etag = hashlib.sha256(raw).hexdigest()
    token = secrets.token_urlsafe(32)

    obj = TelegramRenderedImage(
        id=image_id,
        cap_user_id=cap_user.user_id,
        telegram_user_id=telegram_user_id,
        telegram_chat_id=telegram_chat_id,
        access_token=token,
        mime="image/png",
        bytes=len(raw),
        etag=etag,
        storage_path=filename,
        expires_at=datetime.now() + timedelta(days=IMAGE_TTL_DAYS),
    )
    db.add(obj)
    db.commit()

    rel = f"/api/v1/telegram/image/{image_id}?t={token}"
    return {
        "url": f"{PUBLIC_BASE_URL}{rel}" if absolute else rel,
        "mime": "image/png",
        "bytes": len(raw),
        "expires_at": obj.expires_at.isoformat(),
    }


def _figure_from_vega(result_type: str, vega: dict[str, Any], title: str | None) -> go.Figure:
    values = vega.get("values") or []

    if result_type == "table":
        df = _table_to_dataframe(vega).head(25)
        fig = go.Figure(
            data=[
                go.Table(
                    header={
                        "values": list(df.columns),
                        "align": "left",
                    },
                    cells={
                        "values": [df[c].astype(str).tolist() for c in df.columns],
                        "align": "left",
                    },
                )
            ]
        )
        return _layout(fig, title)

    if result_type == "bar_chart":
        fig = go.Figure(data=[go.Bar(x=[v.get("category") for v in values], y=[v.get("amount") for v in values])])
        return _layout(fig, title)

    if result_type == "pie_chart":
        fig = go.Figure(data=[go.Pie(labels=[v.get("category") for v in values], values=[v.get("value") for v in values])])
        return _layout(fig, title)

    if result_type == "line_chart":
        df = pd.DataFrame(values)
        fig = go.Figure()
        if "c" in df.columns:
            for c, group in df.groupby("c"):
                fig.add_trace(go.Scatter(x=group["x"], y=group["y"], mode="lines+markers", name=str(c)))
        else:
            fig.add_trace(go.Scatter(x=df.get("x"), y=df.get("y"), mode="lines+markers"))
        return _layout(fig, title)

    if result_type == "scatter_chart":
        fig = go.Figure(data=[go.Scatter(x=[v.get("x") for v in values], y=[v.get("y") for v in values], mode="markers")])
        return _layout(fig, title)

    if result_type == "bubble_chart":
        sizes = [max(float(v.get("size") or v.get("z") or 1), 1.0) for v in values]
        fig = go.Figure(
            data=[
                go.Scatter(
                    x=[v.get("x") for v in values],
                    y=[v.get("y") for v in values],
                    mode="markers",
                    marker={
                        "size": sizes,
                        "sizemode": "area",
                        "sizeref": max(sizes) / 80 if sizes else 1,
                    },
                    text=[v.get("label", "") for v in values],
                )
            ]
        )
        return _layout(fig, title)

    if result_type == "heatmap":
        df = pd.DataFrame(values)
        pivot = df.pivot_table(index="y", columns="x", values="value", aggfunc="sum")
        fig = go.Figure(data=[go.Heatmap(z=pivot.values, x=list(pivot.columns), y=list(pivot.index))])
        return _layout(fig, title)

    if result_type == "treemap":
        fig = go.Figure(
            data=[
                go.Treemap(
                    labels=[v.get("label") or v.get("name") or v.get("category") for v in values],
                    parents=[v.get("parent", "") for v in values],
                    values=[v.get("value") for v in values],
                )
            ]
        )
        return _layout(fig, title)

    raise ValueError(f"Unsupported Telegram render type: {result_type}")
