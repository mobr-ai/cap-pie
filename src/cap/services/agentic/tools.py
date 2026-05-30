import json
from typing import Any

from langchain_core.tools import tool

from cap.chains.cardano.canon.query_normalizer import QueryNormalizer
from cap.federated.models import FederatedQuery, QuerySource
from cap.federated.service import execute_federated_query
from cap.services.redis_nl_client import RedisNLClient
from cap.services.similarity_service import SimilarityService
from cap.util.sparql_result_processor import convert_sparql_to_kv


@tool
async def normalize_query_tool(user_query: str) -> str:
    """Normalize a natural-language query for cache lookup."""
    return QueryNormalizer.normalize(user_query)


async def get_cached_federated_query(
    redis_client: RedisNLClient,
    normalized_query: str,
    user_query: str,
) -> FederatedQuery | None:
    cached_data = await redis_client.get_cached_query_with_original(
        normalized_query,
        user_query,
    )
    if not cached_data:
        return None

    payload = cached_data["sparql_query"]

    try:
        parsed = json.loads(payload)
        if isinstance(parsed, dict):
            sparql = parsed.get("sparql", "") or ""
            sql = parsed.get("sql", "") or ""
            source = parsed.get("source") or _infer_source(sparql, sql).value

            return FederatedQuery(
                sparql=sparql,
                sql=sql,
                source=QuerySource(source),
                explanation=parsed.get("explanation", "cached federated query"),
            )
    except json.JSONDecodeError:
        pass

    return FederatedQuery(
        sparql=payload,
        sql="",
        source=QuerySource.ONCHAIN,
        explanation="legacy SPARQL cache entry",
    )


async def cache_successful_query(
    redis_client: RedisNLClient,
    user_query: str,
    federated_query: FederatedQuery,
) -> None:
    payload = json.dumps(
        {
            "source": federated_query.source.value,
            "sparql": federated_query.sparql or "",
            "sql": federated_query.sql or "",
            "explanation": federated_query.explanation or "",
        },
        sort_keys=True,
    )

    result = await redis_client.cache_query(
        nl_query=user_query,
        sparql_query=payload,
    )

    if result == 1:
        await SimilarityService.notify_new_cache_entry()


async def execute_query_tool(query: FederatedQuery):
    return await execute_federated_query(query)


def format_execution_context(
    federated_query: FederatedQuery,
    sparql_results: dict[str, Any],
    sql_results: list[dict[str, Any]],
) -> tuple[str, Any]:
    sections: list[str] = []
    kv_results: Any = None

    if federated_query.sparql:
        kv_results = convert_sparql_to_kv(
            sparql_results,
            federated_query.sparql,
        )
        sections.append(kv_results)

    if federated_query.sql:
        sql_kv = {
            "result_type": "table",
            "data": sql_results,
        }
        sections.append(
            "SQL / OHLCV results:\n"
            + json.dumps(sql_results, default=str, ensure_ascii=False, indent=2)
        )
        if kv_results is None:
            kv_results = sql_kv

    return "\n\n".join(sections), kv_results


def _infer_source(sparql: str, sql: str) -> QuerySource:
    if sparql and sql:
        return QuerySource.FEDERATED
    if sql:
        return QuerySource.ASSET
    return QuerySource.ONCHAIN
