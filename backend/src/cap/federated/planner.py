import json
import logging
from typing import Any

from cap.federated.asset_schema import ASSET_OHLCV_SCHEMA
from cap.federated.models import FederatedQuery, QuerySource
from cap.federated.sql_util import clean_sql
from cap.util.sparql_util import ensure_validity

logger = logging.getLogger(__name__)


FEDERATED_PROMPT = """
You are CAP's federated query planner.

Generate a JSON object only, with this exact shape:
{
  "source": "onchain" | "asset" | "federated",
  "sparql": "...",
  "sql": "...",
  "explanation": "short internal reason"
}

Rules:
- Use SPARQL for Cardano on-chain knowledge graph questions.
- Use SQL for asset market data / OHLCV questions.
- Use both when the answer requires joining on-chain facts with market data.
- For only on-chain queries, sql MUST be "".
- For only asset/OHLCV queries, sparql MUST be "".
- Never generate SQL outside SELECT/WITH.
- Never generate SPARQL updates.
- Return JSON only. No markdown. No comments.
""".strip()


class FederatedPlanner:
    def __init__(self, llm_client: Any):
        self.llm_client = llm_client

    async def generate(
        self,
        natural_query: str,
        conversation_history: list[dict] | None,
        ontology_block: str,
        fewshot_block: str = "",
    ) -> FederatedQuery:
        prompt = f"""
{FEDERATED_PROMPT}

Cardano mini ontology:
{ontology_block}

Asset/OHLCV relational data model:
{ASSET_OHLCV_SCHEMA}

Relevant cached query patterns:
{fewshot_block}

User Question:
{natural_query}
""".strip()

        chunks: list[str] = []
        async for chunk in self.llm_client.generate_stream(
            prompt=prompt,
            model=self.llm_client.llm_model,
            system_prompt="",
            temperature=0.0,
        ):
            chunks.append(chunk)

        raw = "".join(chunks).strip()
        parsed = self._parse_json(raw)

        sparql = parsed.get("sparql", "") or ""
        sql = clean_sql(parsed.get("sql", "") or "")
        source = parsed.get("source") or self._infer_source(sparql, sql)

        if sparql:
            sparql = ensure_validity(sparql, natural_query)

        return FederatedQuery(
            sparql=sparql,
            sql=sql,
            source=QuerySource(source),
            explanation=parsed.get("explanation", ""),
        )

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            if start >= 0 and end > start:
                return json.loads(raw[start:end + 1])
            raise ValueError(f"LLM did not return valid federated JSON: {raw[:500]}")

    @staticmethod
    def _infer_source(sparql: str, sql: str) -> str:
        if sparql and sql:
            return QuerySource.FEDERATED.value
        if sql:
            return QuerySource.ASSET.value
        return QuerySource.ONCHAIN.value
