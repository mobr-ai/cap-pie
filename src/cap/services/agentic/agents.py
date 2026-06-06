import logging

from cap.federated.planner import FederatedPlanner
from cap.services.agentic.state import AgenticQueryState
from cap.services.agentic.tools import (
    cache_successful_query,
    execute_query_tool,
    format_execution_context,
    get_cached_federated_query,
)
from cap.services.llm_client import LLMClient
from cap.services.redis_nl_client import RedisNLClient

logger = logging.getLogger(__name__)

class CacheAgent:
    def __init__(self, redis_client: RedisNLClient):
        self.redis_client = redis_client
        self.use_canonizer = False

    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        user_query = state.get("user_query", "")
        query = user_query
        if self.use_canonizer:
            query = state.get("normalized_query", user_query)

        cached = await get_cached_federated_query(
            redis_client=self.redis_client,
            normalized_query=query,
            user_query=user_query,
            normalize=self.use_canonizer
        )

        state["cached"] = cached is not None
        state["federated_query"] = cached
        state["query_valid"] = cached is not None
        return state


class PlanningAgent:
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client
        self.planner = FederatedPlanner(llm_client)

    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        if state.get("federated_query"):
            return state

        federated_query, refer_decision = await self.llm_client.nl_to_federated_query(
            natural_query=state.get("user_query", ""),
            conversation_history=state.get("conversation_history") or [],
        )

        state["federated_query"] = federated_query
        state["refer_decision"] = refer_decision
        state["query_valid"] = bool(federated_query.sparql or federated_query.sql)
        return state


class ExecutionAgent:
    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        query = state.get("federated_query")
        if not query:
            state["error"] = "No federated query was generated."
            return state

        result = await execute_query_tool(query)
        state["execution_result"] = result
        state["error"] = result.error_msg or None
        return state


class CriticAgent:
    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        result = state.get("execution_result")

        if result and (result.has_data or result.sql_results):
            state["error"] = None
            return state

        retry_count = state.get("retry_count", 0)
        max_retries = state.get("max_retries", 2)

        if state.get("cached") or retry_count >= max_retries:
            return state

        state["retry_count"] = retry_count + 1

        history = list(state.get("conversation_history") or [])
        history.append(
            {
                "role": "user",
                "content": (
                    "The generated federated query failed.\n"
                    f"Error: {state.get('error')}\n"
                    f"Original question: {state.get('user_query', '')}\n"
                    "Regenerate a corrected federated JSON query."
                ),
            }
        )
        state["conversation_history"] = history
        state["federated_query"] = None
        state["query_valid"] = False
        return state


class ContextAgent:
    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        query = state.get("federated_query")
        result = state.get("execution_result")

        if not query or not result:
            state["formatted_results"] = ""
            state["kv_results"] = None
            return state

        has_sparql_data = bool(result.sparql_results)
        has_sql_data = bool(result.sql_results)

        if not has_sparql_data and not has_sql_data:
            if query.sql:
                state["formatted_results"] = (
                    "SQL results:\n"
                    "[]\n\n"
                    "The SQL query executed successfully but returned no rows."
                )
                state["kv_results"] = {
                    "result_type": "table",
                    "data": [],
                    "metadata": {
                        "count": 0,
                        "reason": "SQL query executed successfully but returned no rows.",
                    },
                }

            else:
                state["formatted_results"] = ""
                state["kv_results"] = None

            return state

        logger.info(f"Query has_sql={has_sql_data} has_sparql={has_sparql_data} ")
        logger.info(f"Query sql_results={result.sql_results}")
        logger.info(f"Query sparql_results={result.sparql_results}")

        formatted, kv_results = format_execution_context(
            federated_query=query,
            sparql_results=result.sparql_results,
            sql_results=result.sql_results,
        )

        logger.info(f"Query kv_results={result.kv_results}")

        state["formatted_results"] = formatted
        state["kv_results"] = kv_results
        return state


class AnswerAgent:
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client

    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        chunks: list[str] = []

        query = state.get("federated_query")
        serialized_query = query.model_dump_json() if query else ""

        kv_results = state.get("kv_results")
        if not isinstance(kv_results, dict):
            kv_results = {}

        stream = self.llm_client.generate_answer_with_context(
            user_query=state.get("user_query", ""),
            federated_query=serialized_query,
            formatted_results=state.get("formatted_results", ""),
            kv_results=kv_results,
            system_prompt="",
            conversation_history=state.get("conversation_history"),
        )

        async for chunk in stream:
            chunks.append(chunk)

        state["final_answer"] = "".join(chunks)
        return state


class PersistenceAgent:
    def __init__(self, redis_client: RedisNLClient):
        self.redis_client = redis_client

    async def run(self, state: AgenticQueryState) -> AgenticQueryState:
        if state.get("cached"):
            return state

        result = state.get("execution_result")
        query = state.get("federated_query")

        if result and result.has_data and query:
            await cache_successful_query(
                redis_client=self.redis_client,
                user_query=state.get("user_query", ""),
                federated_query=query,
            )

        return state
