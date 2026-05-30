"""
Natural language query API endpoint using LLM.
Multi-stage pipeline: NL -> SPARQL -> Execute -> Contextualize -> Stream
"""
import logging

from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

class StatusMessage:
    """Helper for creating consistent status messages with rotation support."""

    # Extended status messages for long-running queries
    THINKING_MESSAGES = [
        "status: Analyzing your query deeply\n",
        "status: Exploring the knowledge graph\n",
        "status: Finding relevant connections\n",
        "status: Processing complex relationships\n",
        "status: Gathering comprehensive data\n",
        "status: Cross-referencing information\n",
        "status: Validating query results\n",
        "status: Optimizing data retrieval\n",
    ]

    @staticmethod
    def processing_query() -> str:
        return "status: Processing your query\n"

    @staticmethod
    def no_data() -> str:
        return "I do not have this information yet.\n"

    @staticmethod
    def data_done() -> str:
        return "data: [DONE]\n"

    @staticmethod
    def error(message: str) -> str:
        return f"Error: {message}\n"
