import os

import semantic_kernel as sk
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion


def build_semantic_kernel() -> sk.Kernel:
    kernel = sk.Kernel()

    kernel.add_service(
        OpenAIChatCompletion(
            service_id="cap-agentic-kernel",
            ai_model_id=os.getenv("OPENAI_MODEL", "gpt-5.4"),
            api_key=os.getenv("OPENAI_API_KEY"),
        )
    )

    return kernel
