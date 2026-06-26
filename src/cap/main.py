import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvloop
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from opentelemetry import trace
from sqlalchemy import text
from starlette.responses import FileResponse

from cap.api.auth import router as auth_router
from cap.api.beta_program import router as beta_program_router
from cap.api.cache_admin import router as cache_router
from cap.api.conversation import router as conversation_router
from cap.api.conversation_admin import router as conversation_admin_router
from cap.api.dashboard import router as dashboard_router
from cap.api.demo_nl import router as demo_router
from cap.api.metrics import router as metrics_router
from cap.api.nl_query import router as nl_router
from cap.api.notifications_admin import router as notif_admin_router
from cap.api.share import router as share_router
from cap.api.sparql_query import router as api_router
from cap.api.system_admin import router as system_router
from cap.api.telegram import router as telegram_router
from cap.api.user import router as user_router
from cap.api.user_admin import router as user_admin_router
from cap.api.waitlist import router as wait_router
from cap.api.waitlist_admin import router as wait_admin_router
from cap.chains.registry import get_chain
from cap.config import settings
from cap.database.model import Base
from cap.database.session import engine
from cap.services.llm_client import cleanup_llm_client, get_llm_client
from cap.services.prompt_builder import PromptBuilder
from cap.services.redis_nl_client import cleanup_redis_nl_client
from cap.telemetry import instrument_app, setup_telemetry

load_dotenv()

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")

# Allowed frontend origins (comma-separated env optional)
DEFAULT_CORS = [
    "http://localhost:5173",   # Vite dev
    "http://localhost:4173",   # Vite preview
    "http://0.0.0.0:8000",     # Local dev server
    "http://localhost:8000",   # Local dev server
    "http://127.0.0.1:8000",   # Local dev server
    PUBLIC_BASE_URL,           # production
]
ENV_CORS = os.getenv("CORS_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in ENV_CORS.split(",") if o.strip()] or DEFAULT_CORS

logger = logging.getLogger(__name__)
logger.setLevel(getattr(logging, settings.LOG_LEVEL))
tracer = trace.get_tracer(__name__)

# Set uvloop as the event loop policy
asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    try:
        llm_client = get_llm_client()
        prompt_builder = PromptBuilder()
        try:
            check = prompt_builder.ontology_prompt
            logger.info(f"Ontology prompt is {check}")

            await llm_client.warmup_intent_indices()
            logger.info("Intent indices warmed up successfully")

        except Exception:
            logger.exception("Failed to warm up intent indices during startup")

        yield
    finally:
        await cleanup_llm_client()
        await cleanup_redis_nl_client()
        logger.info("Application shutdown completed")


def setup_tracing():
    # Only set up tracing if explicitly enabled
    if settings.ENABLE_TRACING:
        setup_telemetry()
    else:
        # Set a no-op tracer provider to disable tracing
        trace.set_tracer_provider(trace.NoOpTracerProvider())


def create_application() -> FastAPI:
    setup_tracing()
    app = FastAPI(
        title=settings.APP_NAME,
        description=settings.APP_DESCRIPTION,
        version="0.2.0",
        lifespan=lifespan,
    )

    instrument_app(app)

    # CORS (handles preflight + normal responses)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Client-Request-Id"],
        expose_headers=["Content-Disposition", "X-Conversation-Id", "X-User-Message-Id"],
    )

    # Place all backend routes under /api
    app.include_router(api_router)
    app.include_router(nl_router)
    app.include_router(auth_router)
    app.include_router(beta_program_router)
    app.include_router(user_router)
    app.include_router(user_admin_router)
    app.include_router(wait_router)
    app.include_router(wait_admin_router)
    app.include_router(cache_router)
    app.include_router(dashboard_router)
    app.include_router(share_router)
    app.include_router(system_router)
    app.include_router(metrics_router)
    app.include_router(demo_router)
    app.include_router(notif_admin_router)
    app.include_router(conversation_router)
    app.include_router(conversation_admin_router)
    app.include_router(telegram_router)

    chain = get_chain()

    for router in chain.api_routers():
        app.include_router(router)

    for router in chain.admin_api_routers():
        app.include_router(router)

    return app


app = create_application()

# DB init
Base.metadata.create_all(bind=engine)
with engine.begin() as conn:
    conn.execute(
        text(
            """
    CREATE TABLE IF NOT EXISTS waiting_list (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      ref TEXT,
      language TEXT
    )
    """
        )
    )

# Paths
APP_DIR = os.path.dirname(__file__)
FRONTEND_DIST = os.getenv("FRONTEND_DIST", os.path.join(APP_DIR, "static"))
INDEX_HTML = os.path.join(FRONTEND_DIST, "index.html")

# 1) Serve built assets (safe: only mount if present)
assets_dir = os.path.join(FRONTEND_DIST, "assets")
if os.path.isdir(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Share page static ("shared_pages")
SHARED_PAGES_DIR = os.path.join(APP_DIR, "shared_pages")
if os.path.isdir(SHARED_PAGES_DIR):
    app.mount(
        "/share-static",
        StaticFiles(directory=SHARED_PAGES_DIR),
        name="share-static",
    )

# Optional: avoid noisy 500s for favicon in backend-only mode
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    fav = os.path.join(FRONTEND_DIST, "favicon.ico")
    if os.path.isfile(fav):
        return FileResponse(fav)
    raise HTTPException(status_code=404, detail="Not found")

# 2) LLM interface route (must come before catch-all)
@app.get("/llm", include_in_schema=False)
async def llm_interface():
    """Serve the LLM natural language query interface."""
    llm_page = os.path.join(APP_DIR, "templates", "llm.html")
    if os.path.isfile(llm_page):
        return FileResponse(llm_page)
    raise HTTPException(status_code=404, detail="LLM interface not found")

# 3) Root -> index.html (safe in backend-only mode)
@app.get("/", include_in_schema=False)
async def index():
    if os.path.isfile(INDEX_HTML):
        return FileResponse(INDEX_HTML)
    raise HTTPException(
        status_code=404,
        detail="Frontend not built (missing static/index.html). Run the frontend dev server or build the UI.",
    )

# 4) Catch-all SPA fallback (must be last)
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    # Never let SPA fallback shadow API routes
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    # Try to serve a real file if it exists
    candidate = os.path.join(FRONTEND_DIST, full_path)
    if os.path.isfile(candidate):
        return FileResponse(candidate)

    # Otherwise, serve index.html only if present; else 404 (backend-only mode)
    if os.path.isfile(INDEX_HTML):
        return FileResponse(INDEX_HTML)

    raise HTTPException(
        status_code=404,
        detail="Frontend not built (missing static/index.html).",
    )
