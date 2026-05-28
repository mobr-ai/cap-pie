import json

from cap.chains.cardano.canon.placeholder_restorer import PlaceholderRestorer
from cap.chains.cardano.canon.query_normalizer import QueryNormalizer
from cap.chains.cardano.canon.sparql_normalizer import SPARQLNormalizer
from cap.chains.cardano.canon.value_extractor import ValueExtractor
from cap.federated.models import QuerySource


class CardanoQueryCanonizer:
    def normalize_nl(self, nl_query: str) -> str:
        return QueryNormalizer.normalize(nl_query)

    def normalize_payload(
        self,
        assistant_payload: str,
        *,
        normalize_query: bool = True,
    ) -> tuple[str, dict[str, str], str]:
        query_type = self._detect_cached_query_type(assistant_payload)

        if assistant_payload.strip().startswith("{"):
            parsed = json.loads(assistant_payload)
            sparql = parsed.get("sparql", "") or ""
            sql = parsed.get("sql", "") or ""
        else:
            sparql = assistant_payload if query_type == QuerySource.ONCHAIN.value else ""
            sql = assistant_payload if query_type == QuerySource.ASSET.value else ""

        placeholder_map: dict[str, str] = {}

        if sparql and normalize_query:
            normalizer = SPARQLNormalizer()
            sparql, sparql_placeholders = normalizer.normalize(
                sparql_query=sparql,
                normalize_query=True,
            )
            placeholder_map.update(
                {f"SPARQL::{key}": value for key, value in sparql_placeholders.items()}
            )

        normalized_payload = json.dumps(
            {
                "source": query_type,
                "sparql": sparql,
                "sql": sql,
            },
            sort_keys=True,
        )

        return normalized_payload, placeholder_map, query_type

    def restore_payload(
        self,
        payload: str,
        placeholder_map: dict[str, str],
        current_values: dict[str, list[str]],
    ) -> str:
        parsed = json.loads(payload)

        sparql_map = {
            key.replace("SPARQL::", "", 1): value
            for key, value in placeholder_map.items()
            if key.startswith("SPARQL::")
        }

        if parsed.get("sparql"):
            parsed["sparql"] = PlaceholderRestorer.restore(
                parsed["sparql"],
                sparql_map,
                current_values,
            )

        return json.dumps(parsed, sort_keys=True)

    def extract_values(self, original_query: str) -> dict[str, list[str]]:
        return ValueExtractor.extract(original_query)

    @staticmethod
    def _detect_cached_query_type(assistant_payload: str) -> str:
        text = assistant_payload.strip()

        try:
            parsed = json.loads(text)
            has_sparql = bool(parsed.get("sparql"))
            has_sql = bool(parsed.get("sql"))

            if has_sparql and has_sql:
                return QuerySource.FEDERATED.value
            if has_sql:
                return QuerySource.ASSET.value
            return QuerySource.ONCHAIN.value
        except Exception:
            upper = text.upper()
            has_sparql = (
                any(k in upper for k in ["PREFIX ", "SELECT ", "ASK ", "CONSTRUCT ", "DESCRIBE "])
                and "WHERE" in upper
            )
            has_sql = (
                any(k in upper for k in ["FROM ASSET_OHLCV", "JOIN ASSET", "WITH ", "SELECT "])
                and "PREFIX " not in upper
            )

            if has_sparql and has_sql:
                return QuerySource.FEDERATED.value
            if has_sql:
                return QuerySource.ASSET.value
            return QuerySource.ONCHAIN.value
