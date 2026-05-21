"""
Natural language query API endpoint using LLM.
Multi-stage pipeline: NL -> FederatedQuery(SPARQL/SQL) -> Execute -> Contextualize -> Stream
"""
import logging
import time

from opentelemetry import trace

from cap.services.llm_client import get_llm_client
from cap.services.metrics_service import MetricsService
from cap.services.redis_nl_client import get_redis_nl_client
from cap.util.status_message import StatusMessage

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


async def query_with_stream_response(
    query,
    context,
    db=None,
    user=None,
    conversation_history=None,
):
    start_time = time.time()
    final_state = {}

    try:
        yield StatusMessage.processing_query()

        llm_client = get_llm_client()
        redis_client = get_redis_nl_client()

        from cap.services.agentic.graph import build_agentic_query_graph

        user_query = query
        if context:
            user_query = f"{context}\n\n{query}"

        graph = build_agentic_query_graph(
            llm_client=llm_client,
            redis_client=redis_client,
        )

        final_state = await graph.ainvoke(
            {
                "user_query": user_query,
                "context": context,
                "conversation_history": conversation_history,
                "retry_count": 0,
                "max_retries": 2,
            }
        )

        answer = final_state.get("final_answer")
        if answer:
            yield answer
        elif final_state.get("error"):
            yield StatusMessage.error(final_state["error"])
        else:
            yield StatusMessage.no_data()

        yield StatusMessage.data_done()

    except Exception as exc:
        logger.error("Agentic pipeline error: %s", exc, exc_info=True)
        yield StatusMessage.error(f"Unexpected error: {exc}")
        yield StatusMessage.data_done()

    finally:
        total_latency_ms = int((time.time() - start_time) * 1000)

        try:
            federated_query = final_state.get("federated_query")
            execution_result = final_state.get("execution_result")
            user_id = user.user_id if user else None

            MetricsService.record_query_metrics(
                db=db,
                nl_query=query,
                normalized_query=final_state.get("normalized_query", ""),
                sparql_query=federated_query.model_dump_json() if federated_query else "",
                kv_results=final_state.get("kv_results"),
                is_sequential=False,
                sparql_valid=bool(final_state.get("query_valid")),
                query_succeeded=bool(execution_result and execution_result.has_data),
                llm_latency_ms=0,
                sparql_latency_ms=0,
                total_latency_ms=total_latency_ms,
                user_id=user_id,
                error_message=final_state.get("error"),
            )
        except Exception as metrics_error:
            logger.error("Failed to record metrics: %s", metrics_error)

