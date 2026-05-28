from langgraph.graph import END, StateGraph

from cap.chains.cardano.canon.query_normalizer import QueryNormalizer
from cap.services.agentic.agents import (
    AnswerAgent,
    CacheAgent,
    ContextAgent,
    CriticAgent,
    ExecutionAgent,
    PersistenceAgent,
    PlanningAgent,
)
from cap.services.agentic.state import AgenticQueryState
from cap.services.llm_client import LLMClient
from cap.services.redis_nl_client import RedisNLClient


def build_agentic_query_graph(
    llm_client: LLMClient,
    redis_client: RedisNLClient,
):
    cache_agent = CacheAgent(redis_client)
    planning_agent = PlanningAgent(llm_client)
    execution_agent = ExecutionAgent()
    critic_agent = CriticAgent()
    context_agent = ContextAgent()
    answer_agent = AnswerAgent(llm_client)
    persistence_agent = PersistenceAgent(redis_client)

    async def normalize_node(state: AgenticQueryState) -> AgenticQueryState:
        state["normalized_query"] = QueryNormalizer.normalize(state["user_query"])
        state.setdefault("retry_count", 0)
        state.setdefault("max_retries", 2)
        return state

    async def cache_node(state: AgenticQueryState) -> AgenticQueryState:
        return await cache_agent.run(state)

    async def planning_node(state: AgenticQueryState) -> AgenticQueryState:
        return await planning_agent.run(state)

    async def execution_node(state: AgenticQueryState) -> AgenticQueryState:
        return await execution_agent.run(state)

    async def critic_node(state: AgenticQueryState) -> AgenticQueryState:
        return await critic_agent.run(state)

    async def context_node(state: AgenticQueryState) -> AgenticQueryState:
        return await context_agent.run(state)

    async def answer_node(state: AgenticQueryState) -> AgenticQueryState:
        return await answer_agent.run(state)

    async def persistence_node(state: AgenticQueryState) -> AgenticQueryState:
        return await persistence_agent.run(state)

    def after_cache(state: AgenticQueryState) -> str:
        return "execute" if state.get("federated_query") else "plan"

    def after_critic(state: AgenticQueryState) -> str:
        result = state.get("execution_result")
        if result and result.has_data:
            return "context"
        if state.get("federated_query") is None:
            return "plan"
        return "context"

    workflow = StateGraph(AgenticQueryState)

    workflow.add_node("normalize", normalize_node)
    workflow.add_node("cache", cache_node)
    workflow.add_node("plan", planning_node)
    workflow.add_node("execute", execution_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("context", context_node)
    workflow.add_node("answer", answer_node)
    workflow.add_node("persist", persistence_node)

    workflow.set_entry_point("normalize")
    workflow.add_edge("normalize", "cache")
    workflow.add_conditional_edges("cache", after_cache)
    workflow.add_edge("plan", "execute")
    workflow.add_edge("execute", "critic")
    workflow.add_conditional_edges("critic", after_critic)
    workflow.add_edge("context", "answer")
    workflow.add_edge("answer", "persist")
    workflow.add_edge("persist", END)

    return workflow.compile()
