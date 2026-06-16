import json
import logging
from typing import Any

from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

class QueryFileParser:
    """Parse query files with NL-SPARQL pairs."""

    @staticmethod
    def parse(content: str) -> list[tuple[str, dict[str, Any]]]:
        """Parse query file content into (natural_language, assistant_payload) pairs."""
        queries = []
        lines = content.strip().split('\n')

        current_nl_query = None
        current_payload_lines = []
        in_assistant = False
        in_triple_quotes = False

        for line in lines:
            if not line.strip() and not in_assistant:
                continue

            if line.strip().startswith('MESSAGE user'):
                if current_nl_query and current_payload_lines:
                    payload_text = '\n'.join(current_payload_lines).strip()
                    payload = QueryFileParser._extract_payload(payload_text)
                    queries.append((current_nl_query, payload))

                current_nl_query = line.strip().replace('MESSAGE user', '').strip()
                current_payload_lines = []
                in_assistant = False
                in_triple_quotes = False

            elif line.strip().startswith('MESSAGE assistant'):
                in_assistant = True
                remaining = line.strip().replace('MESSAGE assistant', '').strip()

                if remaining == '"""':
                    in_triple_quotes = True
                elif remaining:
                    current_payload_lines.append(remaining)

            elif in_assistant:
                stripped = line.strip()

                if stripped == '"""':
                    if in_triple_quotes:
                        in_triple_quotes = False
                        in_assistant = False
                    else:
                        in_triple_quotes = True
                    continue

                if in_triple_quotes or not stripped.startswith('MESSAGE'):
                    current_payload_lines.append(line.rstrip())

        if current_nl_query and current_payload_lines:
            payload_text = '\n'.join(current_payload_lines).strip()
            payload = QueryFileParser._extract_payload(payload_text)
            queries.append((current_nl_query, payload))

        return queries

    @staticmethod
    def _extract_payload(payload_text: str) -> dict[str, Any]:
        payload_text = payload_text.strip()

        if payload_text.startswith('"""') and payload_text.endswith('"""'):
            return {
                "sparql": payload_text[3:-3].strip(),
                "sql": "",
            }

        if not payload_text.startswith("{"):
            return {
                "sparql": payload_text,
                "sql": "",
            }

        try:
            return json.loads(payload_text)

        except json.JSONDecodeError:
            logger.info("\n" + "=" * 80)
            logger.info("INVALID JSON PAYLOAD")
            logger.info("=" * 80)
            logger.info(payload_text)
            logger.info("=" * 80)
            raise
