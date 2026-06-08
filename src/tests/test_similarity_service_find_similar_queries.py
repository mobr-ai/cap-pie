import json
import logging

import pytest

from cap.services.redis_nl_client import get_redis_nl_client, cleanup_redis_nl_client
from cap.services.similarity_service import SearchStrategy, SimilarityService

pytestmark = pytest.mark.asyncio

logger = logging.getLogger(__name__)


TEST_QUERIES = [
    (
        "similarity auto test ada current price",
        {
            "sparql": "",
            "sql": "SELECT close FROM asset_ohlcv WHERE symbol = 'ADA' ORDER BY ts DESC LIMIT 1;",
            "source": "offchain",
            "visualization_type": "text",
        },
    ),
    (
        "similarity auto test ada five days price history",
        {
            "sparql": "",
            "sql": "SELECT ts, close FROM asset_ohlcv WHERE symbol = 'ADA' ORDER BY ts ASC;",
            "source": "offchain",
            "visualization_type": "line_chart",
        },
    ),
    (
        "similarity auto test certificate definition",
        {
            "sparql": "SELECT ?def WHERE { ?x rdfs:label \"Certificate\" ; rdfs:comment ?def . }",
            "sql": "",
            "source": "onchain",
            "visualization_type": "text",
        },
    ),
]


async def _delete_test_keys() -> None:
    redis_nl_client = get_redis_nl_client()
    client = await redis_nl_client._get_nlr_client()

    for nl_query, _ in TEST_QUERIES:
        await client.delete(
            redis_nl_client._make_cache_key(nl_query),
            redis_nl_client._make_count_key(nl_query),
        )


@pytest.fixture
async def redis_nl_client():
    client = get_redis_nl_client()

    if not await client.health_check():
        pytest.skip("Redis is not available for SimilarityService integration test")

    logger.info("Cleaning old SimilarityService test keys from Redis")
    await _delete_test_keys()

    yield client

    logger.info("Cleaning SimilarityService test keys from Redis")
    await _delete_test_keys()
    await cleanup_redis_nl_client()


async def test_find_similar_queries_auto_returns_cached_query(redis_nl_client):
    logger.info("Caching test natural-language queries through RedisNLClient")

    for nl_query, payload in TEST_QUERIES:
        result = await redis_nl_client.cache_query(
            nl_query=nl_query,
            payload=payload,
            ttl=120,
            normalize=False,
        )
        assert result == 1, f"Failed to cache query: {nl_query}"

    logger.info("Rebuilding similarity index from Redis cache entries")
    try:
        await SimilarityService._rebuild_index()
    except Exception as exc:
        logger.warning(
            "Embedding index rebuild failed; auto strategy should fall back to Jaccard: %s",
            exc,
        )

    logger.info("Running SimilarityService.find_similar_queries with strategy=auto")
    results = await SimilarityService.find_similar_queries(
        strategy=SearchStrategy.auto,
        nl_query="similarity auto test current ada price",
        top_n=3,
        min_similarity=0.1,
    )

    logger.info("Similarity results: %s", json.dumps(results, indent=2))

    assert results
    assert any(
        row["original_query"] == "similarity auto test ada current price"
        for row in results
    )

    best = results[0]
    assert "original_query" in best
    assert "normalized_query" in best
    assert "federated_query" in best
    assert "similarity_score" in best


async def test_find_similar_queries_auto_respects_top_n(redis_nl_client):
    logger.info("Caching multiple RedisNLClient entries for top_n validation")

    for nl_query, payload in TEST_QUERIES:
        result = await redis_nl_client.cache_query(
            nl_query=nl_query,
            payload=payload,
            ttl=120,
            normalize=False,
        )
        assert result == 1, f"Failed to cache query: {nl_query}"

    try:
        await SimilarityService._rebuild_index()
    except Exception as exc:
        logger.warning(
            "Embedding index rebuild failed; auto strategy should fall back to Jaccard: %s",
            exc,
        )

    results = await SimilarityService.find_similar_queries(
        strategy=SearchStrategy.auto,
        nl_query="similarity auto test ada price",
        top_n=1,
        min_similarity=0.1,
    )

    logger.info("Top-1 similarity result: %s", results)

    assert len(results) <= 1
    assert results
