"""
Natural language query API endpoint using LLM.
Multi-stage pipeline: NL -> FederatedQuery(SPARQL/SQL) -> Execute -> Contextualize -> Stream
"""
import asyncio
import json
import logging
import time
from typing import Any

from opentelemetry import trace

from cap.federated.models import FederatedQuery, QuerySource
from cap.federated.service import execute_federated_query
from cap.rdf.cache.query_normalizer import QueryNormalizer
from cap.services.llm_client import get_llm_client, LLMClient
from cap.services.metrics_service import MetricsService
from cap.services.redis_nl_client import get_redis_nl_client, RedisNLClient
from cap.services.similarity_service import SimilarityService
from cap.util.sparql_result_processor import convert_sparql_to_kv, format_for_llm
from cap.util.status_message import StatusMessage

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


def _infer_source(sparql: str, sql: str) -> QuerySource:
    if sparql and sql:
        return QuerySource.FEDERATED
    if sql:
        return QuerySource.ASSET
    return QuerySource.ONCHAIN


def _serialize_federated_query(query: FederatedQuery) -> str:
    return json.dumps(
        {
            "source": query.source.value,
            "sparql": query.sparql or "",
            "sql": query.sql or "",
            "explanation": query.explanation or "",
        },
        sort_keys=True,
    )


def _deserialize_cached_federated_query(payload: str) -> FederatedQuery:
    """
    Supports both:
    1. New cache format:
       {"source": "asset|onchain|federated", "sparql": "...", "sql": "..."}
    2. Old cache format:
       raw SPARQL string
    """
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
                explanation=parsed.get("explanation", ""),
            )
    except json.JSONDecodeError:
        pass

    return FederatedQuery(
        sparql=payload,
        sql="",
        source=QuerySource.ONCHAIN,
        explanation="legacy SPARQL cache entry",
    )


def _sql_rows_to_llm_text(rows: list[dict[str, Any]], max_items: int = 10000) -> str:
    if not rows:
        return ""

    limited = rows[:max_items]
    return json.dumps(limited, default=str, ensure_ascii=False, indent=2)


def _build_federated_results_for_llm(
    federated_query: FederatedQuery,
    sparql_results: dict[str, Any],
    sql_results: list[dict[str, Any]],
) -> tuple[str, Any]:
    """
    Keeps existing SPARQL formatting for existing chart/answer behavior,
    while adding SQL rows for asset/OHLCV answers.
    """
    sections: list[str] = []
    kv_results: Any = None

    if federated_query.sparql:
        kv_results = convert_sparql_to_kv(
            sparql_results,
            sparql_query=federated_query.sparql,
        )
        sections.append(
            "SPARQL / on-chain results:\n"
            + format_for_llm(kv_results, max_items=10000)
        )

    if federated_query.sql:
        sections.append(
            "SQL / asset OHLCV results:\n"
            + _sql_rows_to_llm_text(sql_results, max_items=10000)
        )

    if federated_query.sparql and federated_query.sql:
        combined_kv = {
            "result_type": "table",
            "data": [
                {
                    "source": "onchain",
                    "data": kv_results,
                },
                {
                    "source": "asset_ohlcv",
                    "data": sql_results,
                },
            ],
        }
        return "\n\n".join(sections), combined_kv

    if federated_query.sql:
        sql_kv = {
            "result_type": "table",
            "data": sql_results,
        }
        return "\n\n".join(sections), sql_kv

    return "\n\n".join(sections), kv_results


async def nlq_to_federated_query(
    user_query: str,
    redis_client: RedisNLClient,
    llm_client: LLMClient,
    conversation_history: list[dict],
    normalize: bool = True,
) -> tuple[str, FederatedQuery, bool, bool, Any]:
    nl_query = QueryNormalizer.normalize(user_query) if normalize else user_query

    cached_data = await redis_client.get_cached_query_with_original(
        nl_query,
        user_query,
    )

    if cached_data:
        logger.info("Cache HIT for %s -> %s", user_query, nl_query)
        federated_query = _deserialize_cached_federated_query(
            cached_data["sparql_query"]
        )
        return nl_query, federated_query, True, True, None

    logger.info("Cache MISS for %s -> %s", user_query, nl_query)

    federated_query, refer_decision = await llm_client.nl_to_federated_query(
        natural_query=user_query,
        conversation_history=conversation_history,
    )

    query_valid = bool(federated_query.sparql or federated_query.sql)
    return nl_query, federated_query, query_valid, False, refer_decision


async def query_with_stream_response(
    query,
    context,
    db=None,
    user=None,
    conversation_history=None,
):
    start_time = time.time()

    normalized = ""
    federated_query: FederatedQuery | None = None
    federated_query_str = ""
    kv_results = None
    error_msg = None
    has_data = False

    query_valid = False
    was_from_cache = False
    llm_start = None
    execution_start = None
    execution_latency_ms = 0
    llm_latency_ms = 0

    try:
        yield StatusMessage.processing_query()

        llm_client = get_llm_client()
        redis_client = get_redis_nl_client()

        user_query = query
        if context:
            logger.info("Querying with context.")
            logger.info("User query: %s", user_query)
            logger.info("Context: %s", context)
            user_query = f"{context}\n\n{query}"

        max_retries = 2
        retry_count = 0
        ch = conversation_history
        refer_decision = None

        while retry_count <= max_retries:
            try:
                logger.info(
                    "Stage 1: convert NL to federated query "
                    "(attempt %s/%s)",
                    retry_count + 1,
                    max_retries + 1,
                )

                normalized, federated_query, query_valid, was_from_cache, refer_decision = (
                    await nlq_to_federated_query(
                        user_query=user_query,
                        redis_client=redis_client,
                        llm_client=llm_client,
                        conversation_history=ch,
                    )
                )

                federated_query_str = _serialize_federated_query(federated_query)

                yield StatusMessage.executing_query()

                logger.info(
                    "Stage 2: execute federated query source=%s has_sparql=%s has_sql=%s",
                    federated_query.source.value,
                    bool(federated_query.sparql),
                    bool(federated_query.sql),
                )

                execution_start = time.time()
                execution_result = await execute_federated_query(federated_query)
                execution_latency_ms = int((time.time() - execution_start) * 1000)

                has_data = execution_result.has_data
                error_msg = execution_result.error_msg or None

                if has_data and not was_from_cache:
                    result = await redis_client.cache_query(
                        nl_query=user_query,
                        sparql_query=federated_query_str,
                    )

                    if result == 1:
                        try:
                            await SimilarityService.notify_new_cache_entry()
                        except Exception as notify_exc:
                            logger.warning(
                                "SimilarityService notification failed: %s",
                                notify_exc,
                            )

                break

            except Exception as exec_error:
                error_msg = str(exec_error)
                logger.error(
                    "Federated query execution error "
                    "(attempt %s/%s): %s",
                    retry_count + 1,
                    max_retries + 1,
                    error_msg,
                )

                if was_from_cache or retry_count >= max_retries:
                    logger.error(
                        "Cannot retry: query was from cache or max retries reached"
                    )
                    has_data = False
                    execution_result = None
                    break

                retry_count += 1
                yield StatusMessage.processing_query()

                ch = list(ch) if ch else []
                ch.append(
                    {
                        "role": "user",
                        "content": (
                            "The federated query you generated failed with this error:\n\n"
                            f"{error_msg}\n\n"
                            "Please generate a corrected federated JSON query. "
                            f"Original question: {query}"
                        ),
                    }
                )

        if has_data:
            yield StatusMessage.processing_results()

        try:
            llm_start = time.time()

            formatted_results = ""
            if has_data and federated_query and execution_result:
                formatted_results, kv_results = _build_federated_results_for_llm(
                    federated_query=federated_query,
                    sparql_results=execution_result.sparql_results,
                    sql_results=execution_result.sql_results,
                )

            if not refer_decision or refer_decision.label != "refer":
                ch = None

            context_stream = llm_client.generate_answer_with_context(
                user_query=user_query,
                sparql_query=federated_query_str,
                sparql_results=formatted_results,
                kv_results=kv_results,
                system_prompt="",
                conversation_history=ch,
            )

            llm_latency_ms = int((time.time() - llm_start) * 1000)

            async for chunk in stream_with_timeout_messages(
                context_stream,
                timeout_seconds=300.0,
            ):
                yield chunk

        except Exception as e:
            logger.error("Contextualization error: %s", e)
            error_msg = str(e)
            yield StatusMessage.error(f"Error generating answer: {str(e)}")

        yield StatusMessage.data_done()

    except Exception as e:
        logger.error("Pipeline error: %s", e)
        error_msg = str(e)
        has_data = False
        yield StatusMessage.error(f"Unexpected error: {str(e)}")
        yield StatusMessage.data_done()

    finally:
        total_latency_ms = int((time.time() - start_time) * 1000)

        try:
            user_id = user.user_id if user else None

            MetricsService.record_query_metrics(
                db=db,
                nl_query=query,
                normalized_query=normalized,
                sparql_query=federated_query_str,
                kv_results=kv_results,
                is_sequential=False,
                sparql_valid=query_valid,
                query_succeeded=has_data,
                llm_latency_ms=llm_latency_ms,
                sparql_latency_ms=execution_latency_ms,
                total_latency_ms=total_latency_ms,
                user_id=user_id,
                error_message=error_msg,
            )
        except Exception as metrics_error:
            logger.error("Failed to record metrics: %s", metrics_error)


async def stream_with_timeout_messages(
    stream_generator,
    timeout_seconds: float = 300.0,
):
    message_cycle = StatusMessage.get_thinking_message_cycle()
    last_status_time = asyncio.get_event_loop().time()

    try:
        stream_iter = stream_generator.__aiter__()

        while True:
            try:
                chunk = await asyncio.wait_for(
                    stream_iter.__anext__(),
                    timeout=timeout_seconds,
                )
                last_status_time = asyncio.get_event_loop().time()
                yield chunk

            except asyncio.TimeoutError:
                current_time = asyncio.get_event_loop().time()
                if current_time - last_status_time >= timeout_seconds:
                    yield next(message_cycle)
                    last_status_time = current_time
                continue

            except StopAsyncIteration:
                logger.info("LLM stream completed successfully")
                break

    except asyncio.CancelledError:
        logger.warning("Client cancelled the stream connection")
        raise

    except Exception as e:
        logger.error("Error in stream wrapper: %s", e)
        raise
