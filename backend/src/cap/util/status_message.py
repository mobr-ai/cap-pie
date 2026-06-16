class StatusMessage:
    """Helper for creating consistent status messages with rotation support."""

    GRAPH_STEP_MESSAGES = {
        "normalize": "status: Normalizing query\n",
        "cache": "status: Checking semantic cache\n",
        "plan": "status: Planning federated query\n",
        "execute": "status: Executing query\n",
        "critic": "status: Validating execution result\n",
        "context": "status: Formatting execution context\n",
        "answer": "",
        "persist": "",
    }

    @staticmethod
    def processing_query() -> str:
        return "status: Processing your query\n"

    @staticmethod
    def graph_step(step_name: str) -> str:
        return StatusMessage.GRAPH_STEP_MESSAGES.get(
            step_name
        )

    @staticmethod
    def retry_query(retry_count: int) -> str:
        return f"status: Regenerating query after failed attempt {retry_count}\n"

    @staticmethod
    def no_data() -> str:
        return "I do not have this information yet.\n"

    @staticmethod
    def data_done() -> str:
        return "data: [DONE]\n"

    @staticmethod
    def error(message: str) -> str:
        return f"Error: {message}\n"
