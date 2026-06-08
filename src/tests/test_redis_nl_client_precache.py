# tests/integration/test_redis_nl_client_precache_from_file.py

import json

import pytest
import redis.asyncio as redis

from pathlib import Path

from cap.services.redis_nl_client import RedisNLClient


pytestmark = pytest.mark.asyncio


PRECACHE_CONTENT = """
MESSAGE user What is the current price of ADA?
MESSAGE assistant
{
  "sparql": "",
  "sql": "SELECT a.symbol, o.close AS current_price, o.ts AS price_timestamp FROM asset_ohlcv o JOIN asset a ON a.asset_id = o.asset_id WHERE UPPER(a.symbol) = 'ADA' AND o.interval = '1h' ORDER BY o.ts DESC LIMIT 1;",
  "explanation": "Needs offchain data only since user asked for current price.",
  "source": "onchain",
  "visualization_type": "text"
}

MESSAGE user Show ADA price in the last 5 days
MESSAGE assistant
{
  "sparql": "",
  "sql": "SELECT a.symbol, o.close AS price, o.ts AS price_timestamp FROM asset_ohlcv o JOIN asset a ON a.asset_id = o.asset_id WHERE UPPER(a.symbol) = 'ADA' AND o.interval = '1h' AND o.ts >= NOW() - INTERVAL '5 days' ORDER BY o.ts ASC;",
  "explanation": "Needs offchain data only since user asked for price history over the last 5 days.",
  "source": "offchain",
  "visualization_type": "line_chart"
}

MESSAGE user What is your current tip and the current cardano tip?
MESSAGE assistant
{
  "sparql": "PREFIX b: <https://mobr.ai/ont/blockchain#>\\nPREFIX c: <https://mobr.ai/ont/cardano#>\\nPREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\\n\\nSELECT ?currentCardanoHeight (MAX(?blockHeight) AS ?capBlockNum)\\nWHERE {\\n  c:Cardano c:hasBlockNumber ?currentCardanoHeightRaw .\\n  BIND(xsd:integer(?currentCardanoHeightRaw) AS ?currentCardanoHeight)\\n\\n  ?block a b:Block ;\\n         c:hasBlockNumber ?blockNum .\\n  BIND(xsd:integer(?blockNum) AS ?blockHeight)\\n}\\nGROUP BY ?currentCardanoHeight",
  "sql": "",
  "explanation": "Needs onchain data only.",
  "source": "onchain",
  "visualization_type": "text"
}

MESSAGE user Define a certificate?
MESSAGE assistant \"\"\"
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?def
WHERE {
    ?x rdfs:label "Certificate" .
    ?x rdfs:comment ?def .
}
\"\"\"
"""

def get_precache_content() -> str:
    messages_file = Path("test.messages")
    if messages_file.exists():
        return messages_file.read_text(encoding="utf-8")
    return PRECACHE_CONTENT

@pytest.fixture
async def redis_client():
    client = redis.Redis(
        host="localhost",
        port=6379,
        db=15,
        decode_responses=True,
    )

    try:
        await client.ping()
    except Exception as exc:
        pytest.skip(f"Redis is not available on localhost:6379: {exc}")

    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()


@pytest.fixture
async def nl_client(redis_client):
    client = RedisNLClient(host="localhost", port=6379, db=15, ttl=60)
    yield client
    await client.close()


async def test_precache_from_file_caches_all_supported_file_formats(
    tmp_path,
    redis_client,
    nl_client,
):
    precache_file = tmp_path / "precache_queries.txt"
    precache_content = get_precache_content()
    precache_file.write_text(precache_content, encoding="utf-8")

    stats = await nl_client.precache_from_file(
        str(precache_file),
        ttl=120,
        normalize=False,
    )

    assert stats["failed"] == 0

    if precache_content == PRECACHE_CONTENT:
        expected_queries = [
            "What is the current price of ADA?",
            "Show ADA price in the last 5 days",
            "What is your current tip and the current cardano tip?",
            "Define a certificate?",
        ]

        for query in expected_queries:
            cache_key = f"nlq:cache:{query}"
            count_key = f"nlq:count:{query}"

            raw_cached = await redis_client.get(cache_key)
            assert raw_cached is not None, f"missing cache entry for {query}"

            cached = json.loads(raw_cached)

            assert cached["original_query"] == query
            assert cached["normalized_query"] == query
            assert cached["precached"] is True
            assert cached["placeholder_map"] == {}
            assert cached["is_sequential"] is False

            assert await redis_client.get(count_key) == "1"
            assert 0 < await redis_client.ttl(cache_key) <= 120
            assert 0 < await redis_client.ttl(count_key) <= 120

        ada_price = json.loads(await redis_client.get("nlq:cache:What is the current price of ADA?"))
        ada_payload = json.loads(ada_price["federated_query"])
        assert ada_payload["sql"].startswith("SELECT a.symbol")
        assert ada_payload["sparql"] == ""
        assert ada_payload["visualization_type"] == "text"

        certificate = json.loads(await redis_client.get("nlq:cache:Define a certificate?"))
        certificate_payload = json.loads(certificate["federated_query"])
        assert certificate_payload["sparql"].startswith("PREFIX rdfs:")
        assert '?x rdfs:label "Certificate"' in certificate_payload["sparql"]
        assert certificate_payload["sql"] == ""


async def test_precache_from_file_skips_duplicates_on_second_run(tmp_path, nl_client):
    precache_file = tmp_path / "precache_queries.txt"
    precache_file.write_text(get_precache_content(), encoding="utf-8")

    first = await nl_client.precache_from_file(str(precache_file), ttl=120, normalize=False)
    second = await nl_client.precache_from_file(str(precache_file), ttl=120, normalize=False)

    assert first["failed"] == 0
    assert second["failed"] == 0


async def test_precache_from_file_reports_file_level_error(nl_client, tmp_path):
    missing_file = tmp_path / "does_not_exist.txt"

    stats = await nl_client.precache_from_file(str(missing_file), normalize=False)

    assert stats["total_queries"] == 0
    assert stats["cached_successfully"] == 0
    assert stats["failed"] == 0
    assert stats["skipped_duplicates"] == 0
    assert len(stats["errors"]) == 1
    assert stats["errors"][0].startswith("Error during pre-caching:")
    assert "does_not_exist.txt" in stats["errors"][0]
