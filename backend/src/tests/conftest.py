import logging
import os
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from dotenv import load_dotenv
from httpx import AsyncClient

from cap.config import settings
from cap.rdf.triplestore import TriplestoreClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=True)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@pytest.fixture(scope="session", autouse=True)
def set_test_env():
    old = os.environ.get("REDIS_HOST")
    os.environ["REDIS_HOST"] = "localhost"

    yield

    if old is None:
        os.environ.pop("REDIS_HOST", None)
    else:
        os.environ["REDIS_HOST"] = old

@pytest.fixture(scope="session")
def virtuoso_client():
    return TriplestoreClient()


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    base_url = f"http://{settings.APP_HOST}:{settings.APP_PORT}"
    logger.debug(f"Creating async client with base_url: {base_url}")

    async with AsyncClient(
        base_url=base_url,
        follow_redirects=True,
        timeout=300.0,
    ) as client:
        yield client
