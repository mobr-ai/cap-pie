"""
Redis client for caching natural language to sparql mappings.
"""
import json
import logging
import os
import re
from typing import Any, TypedDict

import redis.asyncio as redis
from opentelemetry import trace

from cap.chains.registry import get_chain
from cap.federated.models import QuerySource
from cap.util.query_file_parser import QueryFileParser

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class PrecacheStats(TypedDict):
    """Statistics returned by RedisNLClient.precache_from_file."""

    total_queries: int
    cached_successfully: int
    failed: int
    skipped_duplicates: int
    errors: list[str]


class RedisNLClient:
    """Redis client for caching natural language to sparql mappings. Main goal is to reduce usage of llm model."""

    def __init__(
        self,
        host: str | None = None,
        port: int = 6379,
        db: int = 0,
        ttl: int = 86400 * 365
    ):
        """Initialize Redis client."""
        self.host = host or os.getenv("REDIS_HOST", "localhost")
        self.port = int(os.getenv("REDIS_PORT", port))
        self.db = db
        self.ttl = ttl
        self._client: redis.Redis | None = None

    async def _get_nlr_client(self) -> redis.Redis:
        """Get or create Redis client."""
        if self._client is None:
            self._client = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True
            )
        return self._client

    async def close(self):
        """Close the Redis client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _make_cache_key(self, normalized_nl: str) -> str:
        """Create cache key from normalized natural language query."""
        return f"nlq:cache:{normalized_nl}"

    def _make_count_key(self, normalized_nl: str) -> str:
        """Create count key from normalized natural language query."""
        return f"nlq:count:{normalized_nl}"

    async def cache_query(
        self,
        nl_query: str,
        sparql_query: str,
        ttl: int | None = None,
        normalize: bool = True
    ) -> int:
        """Cache query with placeholder normalization."""
        with tracer.start_as_current_span("cache_sparql_query") as span:
            span.set_attribute("nl_query", nl_query)

            try:
                client = await self._get_nlr_client()
                canonizer = get_chain().query_canonizer()
                user_query = (
                    canonizer.normalize_nl(nl_query)
                    if normalize and canonizer is not None
                    else nl_query
                )

                cache_key = self._make_cache_key(user_query)
                count_key = self._make_count_key(user_query)

                # Checking if query already exists
                if await client.exists(cache_key):
                    return 0  # Indicates duplicate, not cached

                # Process SPARQL (single or sequential)
                normalized_payload, placeholder_map, query_type = self._normalize_federated_query(
                    sparql_query,
                    normalize_query=normalize,
                )
                cache_data = {
                    "original_query": nl_query,
                    "normalized_query": user_query,
                    "sparql_query": normalized_payload,
                    "placeholder_map": placeholder_map,
                    "is_sequential": isinstance(sparql_query, str) and sparql_query.strip().startswith('['),
                    "precached": False,
                    "query_type": query_type,
                }

                ttl_value = ttl or self.ttl
                await client.setex(cache_key, ttl_value, json.dumps(cache_data))
                await client.incr(count_key)
                await client.expire(count_key, ttl_value)

                return 1  # Successfully cached

            except Exception as e:
                span.set_attribute("error", str(e))
                logger.error(f"Failed to cache query: {e}")
                return -1  # cache error

    async def precache_from_file(
        self,
        file_path: str,
        ttl: int | None = None,
        normalize: bool = True
    ) -> PrecacheStats:
        """Pre-cache natural language to SPARQL mappings from a file."""
        with tracer.start_as_current_span("precache_from_file") as span:
            span.set_attribute("file_path", file_path)

            stats: PrecacheStats = {
                "total_queries": 0,
                "cached_successfully": 0,
                "failed": 0,
                "skipped_duplicates": 0,
                "errors": [],
            }

            try:
                with open(file_path, encoding='utf-8') as f:
                    content = f.read()

                queries = QueryFileParser.parse(content)
                stats["total_queries"] = len(queries)
                client = await self._get_nlr_client()
                ttl_value = ttl or self.ttl
                skipped_keys: list[str] = []
                cached_keys: list[str] = []

                canonizer = get_chain().query_canonizer()

                for nl_query, sparql_query in queries:
                    try:
                        user_query = (
                            canonizer.normalize_nl(nl_query)
                            if normalize and canonizer is not None
                            else nl_query
                        )

                        cache_key = self._make_cache_key(user_query)
                        success = await self.cache_query(nl_query, sparql_query, ttl_value, normalize)
                        if success == 1:
                            # major trust on predefined (precached) queries
                            cached_data = await client.get(cache_key)
                            if cached_data:
                                data = json.loads(cached_data)
                                data["precached"] = True
                                await client.setex(cache_key, ttl_value, json.dumps(data))
                                cached_keys.append(cache_key)

                            logger.debug ("query cached ")
                            logger.debug (f"    nl query {nl_query} ")
                            logger.debug (f"    sparql query {sparql_query} ")
                            logger.debug (f"    ttl {ttl_value} ")

                            stats["cached_successfully"] += 1
                        elif success == 0:
                            stats["skipped_duplicates"] += 1
                            skipped_keys.append(cache_key)
                        else:
                            stats["failed"] += 1
                            error_msg = f"Failed to cache '{nl_query}...'"
                            stats["errors"].append(error_msg)
                            logger.error(error_msg)

                    except Exception as e:
                        stats["failed"] += 1
                        error_msg = f"Failed to cache '{nl_query}...': {str(e)}"
                        stats["errors"].append(error_msg)
                        logger.error(error_msg)

                logger.info(
                    f"Pre-caching completed: {stats['cached_successfully']} cached, "
                    f"{stats['failed']} failed, {stats['skipped_duplicates']} skipped"
                )

                nl_queries = [nl for nl, _ in queries]
                logger.info(
                    f"Original queries: \n{nl_queries} \n"
                    f"Cached keys: \n{cached_keys} \n"
                    f"Skipped keys: \n{skipped_keys} \n"
                )
                return stats

            except Exception as e:
                error_msg = f"Error during pre-caching: {str(e)}"
                span.set_attribute("error", error_msg)
                logger.error(error_msg)
                stats["errors"].append(error_msg)
                return stats


    def _detect_cached_query_type(self, assistant_payload: str) -> str:
        text = assistant_payload.strip()

        try:
            parsed = json.loads(text)
            has_sparql = bool(parsed.get("sparql"))
            has_sql = bool(parsed.get("sql"))
            if has_sparql and has_sql:
                return QuerySource.FEDERATED.value
            if has_sql:
                return QuerySource.ASSET.value
            return QuerySource.ONCHAIN.value
        except Exception:
            upper = text.upper()
            has_sparql = any(k in upper for k in ["PREFIX ", "SELECT ", "ASK ", "CONSTRUCT ", "DESCRIBE "]) and "WHERE" in upper
            has_sql = any(k in upper for k in ["FROM ASSET_OHLCV", "JOIN ASSET", "WITH ", "SELECT "]) and "PREFIX " not in upper

            if has_sparql and has_sql:
                return QuerySource.FEDERATED.value
            if has_sql:
                return QuerySource.ASSET.value
            return QuerySource.ONCHAIN.value


    def _normalize_federated_query(
        self,
        assistant_payload: str,
        normalize_query: bool = True,
    ) -> tuple[str, dict[str, str], str]:
        canonizer = get_chain().query_canonizer()

        if canonizer is not None and normalize_query:
            return canonizer.normalize_payload(
                assistant_payload,
                normalize_query=True,
            )

        query_type = self._detect_cached_query_type(assistant_payload)

        if assistant_payload.strip().startswith("{"):
            parsed = json.loads(assistant_payload)
            sparql = parsed.get("sparql", "") or ""
            sql = parsed.get("sql", "") or ""
        else:
            sparql = assistant_payload if query_type == QuerySource.ONCHAIN.value else ""
            sql = assistant_payload if query_type == QuerySource.ASSET.value else ""

        return (
            json.dumps(
                {
                    "source": query_type,
                    "sparql": sparql,
                    "sql": sql,
                },
                sort_keys=True,
            ),
            {},
            query_type,
        )


    async def get_cached_query_with_original(
        self,
        normalized_query: str,
        original_query: str
    ) -> dict[str, Any] | None:
        """Retrieve cached query and restore placeholders."""
        with tracer.start_as_current_span("get_cached_query_with_original") as span:
            try:
                client = await self._get_nlr_client()

                # Try exact normalized match first
                cache_key = self._make_cache_key(normalized_query)
                cached = await client.get(cache_key)

                if not cached:
                    span.set_attribute("cache_hit", False)
                    logger.debug ("Cache MISS")
                    logger.debug (f" query normalized to {normalized_query}")
                    return None

                data = json.loads(cached)
                canonizer = get_chain().query_canonizer()
                current_values = (
                    canonizer.extract_values(original_query)
                    if canonizer is not None
                    else {}
                )
                placeholder_map = data.get("placeholder_map", {})

                if not placeholder_map:
                    span.set_attribute("cache_hit", True)
                    logger.debug ("Cache HIT without placeholders")
                    return data

                # Restore placeholders
                restored_payload = self._restore_federated_payload(
                    data["sparql_query"],
                    placeholder_map,
                    current_values,
                )

                remaining_placeholders = re.findall(r'<<[A-Z_]+_\d+>>', restored_payload)
                if remaining_placeholders:
                    logger.error(f"Failed to restore placeholders: {remaining_placeholders}")
                    logger.error(f"Original query: {original_query}")
                    logger.error(f"Cached normalized: {normalized_query}")
                    span.set_attribute("cache_hit", False)
                    return None

                data["sparql_query"] = restored_payload
                span.set_attribute("cache_hit", True)
                return data

            except Exception as e:
                span.set_attribute("error", str(e))
                logger.error(f"Failed to retrieve cached query: {e}")
                return None

    def _restore_federated_payload(
        self,
        payload: str,
        placeholder_map: dict[str, str],
        current_values: dict[str, list[str]],
    ) -> str:
        canonizer = get_chain().query_canonizer()

        if canonizer is None:
            return payload

        return canonizer.restore_payload(
            payload,
            placeholder_map,
            current_values,
        )


    async def get_popular_queries(self, limit: int = 5) -> list[dict[str, Any]]:
        """Get most popular queries."""
        with tracer.start_as_current_span("get_popular_queries") as span:
            span.set_attribute("limit", limit)

            try:
                client = await self._get_nlr_client()
                count_keys = []

                async for key in client.scan_iter(match="nlq:count:*"):
                    count_keys.append(key)

                queries_with_counts = []
                for count_key in count_keys:
                    count = await client.get(count_key)
                    if count:
                        normalized = count_key.replace("nlq:count:", "")
                        cache_key = f"nlq:cache:{normalized}"
                        cache_data = await client.get(cache_key)

                        if cache_data:
                            data = json.loads(cache_data)
                            queries_with_counts.append({
                                "original_query": data.get("original_query", normalized),
                                "normalized_query": normalized,
                                "count": int(count)
                            })

                queries_with_counts.sort(key=lambda x: x["count"], reverse=True)
                if limit > 0:
                    return queries_with_counts[:limit]

                return queries_with_counts

            except Exception as e:
                span.set_attribute("error", str(e))
                logger.error(f"Failed to get popular queries: {e}")
                return []


    async def health_check(self) -> bool:
        """Check if Redis is available."""
        try:
            client = await self._get_nlr_client()
            await client.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return False


# Global client instance
_redis_nl_client: RedisNLClient | None = None


def get_redis_nl_client() -> RedisNLClient:
    """Get or create global Redis client instance."""
    global _redis_nl_client
    if _redis_nl_client is None:
        _redis_nl_client = RedisNLClient()
    return _redis_nl_client


async def cleanup_redis_nl_client():
    """Cleanup global Redis client."""
    global _redis_nl_client
    if _redis_nl_client:
        await _redis_nl_client.close()
        _redis_nl_client = None
