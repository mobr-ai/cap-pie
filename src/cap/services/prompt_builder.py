"""
Prompt builder for LLM workflows.
Keeps prompt loading, ontology injection, few-shot examples, and history handling
outside the transport-focused LLM client.
"""

import logging
import os
from datetime import UTC, datetime
from typing import Any

from cap.chains.registry import get_chain
from cap.config import settings
from cap.services.msg_formatter import MessageFormatter
from cap.services.similarity_service import SearchStrategy, SimilarityService
from cap.util.str_util import get_file_content

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 18000

class PromptBuilder:
    """Builds prompts and prompt fragments used by LLM workflows."""

    def __init__(self, fewshot_top_n: int | None = None):
        self.fewshot_top_n = fewshot_top_n or int(os.getenv("FEWSHOT_TOP_N") or "3")

    def _load_prompt(self, env_key: str, default: str = "") -> str:
        return os.getenv(env_key, default)

    @property
    def default_nl_to_sparql_prompt(self) -> str:
        return self._load_prompt(
            "NL_TO_SPARQL_PROMPT",
            get_chain().default_nl_to_sparql_prompt(),
        )

    @property
    def default_chart_prompt(self) -> str:
        return self._load_prompt(
            "CHART_PROMPT",
            get_chain().default_chart_prompt(),
        )

    @property
    def ontology_prompt(self) -> str:
        if settings.LLM_ONTOLOGY_PATH != "":
            onto = get_file_content(settings.LLM_ONTOLOGY_PATH)
            return f"ALWAYS USE THIS ONTOLOGY:\n{onto}"

        logger.warning("** MINI ONTOLOGY NOT FOUND!!!")
        return ""

    @property
    def federated_prompt(self) -> str:
        return self._load_prompt(
            "FEDERATED_PROMPT",
            "Create a federated query in a json, specifying sql for asset price movement and sparql for onchain data.",
        )

    @property
    def contextualize_prompt(self) -> str:
        return self._load_prompt(
            "CONTEXTUALIZE_PROMPT",
            "Based on the query results, provide a clear and helpful answer.",
        )

    async def build_fewshot_block(
        self,
        nl_query: str,
        strategy: SearchStrategy = SearchStrategy.auto,
        top_n: int = -1,
        min_similarity: float = 0.0,
        _eval_retrieved_out: list[dict[str, Any]] | None = None,
    ) -> str:
        effective_top_n = top_n if top_n != -1 else self.fewshot_top_n

        similar = await SimilarityService.find_similar_queries(
            strategy=strategy,
            nl_query=nl_query,
            top_n=effective_top_n,
            min_similarity=min_similarity,
        )

        if _eval_retrieved_out is not None:
            _eval_retrieved_out.extend(similar)

        messages = MessageFormatter.format_similar_queries_to_examples(
            similar_queries=similar,
            max_examples=effective_top_n,
        )

        return MessageFormatter.append_examples_to_prompt(
            examples=messages,
            existing_prompt="",
        )

    def add_history(
        self,
        prompt: str,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> str:
        history: list[dict[str, Any]] = []

        if conversation_history:
            reversed_history = list(reversed(conversation_history))
            kept_history: list[dict[str, Any]] = []
            current_size = len(prompt)

            for msg in reversed_history:
                msg_size = len(msg.get("content", ""))
                if current_size + msg_size < MAX_CONTEXT_CHARS:
                    kept_history.append(msg)
                    current_size += msg_size
                else:
                    logger.info(
                        "Truncated conversation history at %s messages due to context limit",
                        len(kept_history),
                    )
                    break

            history = list(reversed(kept_history))

        str_history = "\n".join(
            f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
            for msg in history
        )

        return f"{prompt}\nPrevious messages:\n{str_history}" if str_history else prompt

    def build_answer_prompt(
        self,
        user_query: str,
        context_res: str,
        result_type: str,
        kv_results: dict[str, Any],
        conversation_history: list[dict[str, Any]] | None,
    ) -> tuple[str, list[dict[str, Any]] | None, float]:
        current_date = f"Current utc date and time: {datetime.now(UTC)}."
        current_his = None
        temperature = 0.1

        if "chart" in result_type or "table" in result_type:
            known_info = f"""
                {current_date}
                {self.default_chart_prompt}
                The system is showing an artifact to the user using the data below. Always write a SHORT insight about it.
                {kv_results}
                """

        elif context_res != "":
            known_info = f"""
                {current_date}
                This is the current value you MUST consider in your answer:
                {context_res}

                {self.contextualize_prompt}
                """
            current_his = conversation_history

        else:
            known_info = """
                    Answer with a text similar to the following message:
                    I do not have this information or I was not capable of retrieving it correctly.
                    We would appreciate it if you could specify here what you wanted to do as a feature and we will try to make your prompt work asap.
                    If you think this feature is already supported, try specifying the entire command in a unique prompt.
                """

        prompt = f"""
                User Question: {user_query}

                {known_info}
            """

        return self.add_history(prompt, current_his), current_his, temperature
