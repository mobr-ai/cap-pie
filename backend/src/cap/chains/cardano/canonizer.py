import json

from cap.chains.cardano.canon.placeholder_restorer import PlaceholderRestorer
from cap.chains.cardano.canon.query_normalizer import QueryNormalizer
from cap.chains.cardano.canon.sparql_normalizer import SPARQLNormalizer
from cap.chains.cardano.canon.value_extractor import ValueExtractor


class CardanoQueryCanonizer:
    def normalize_nl(self, nl_query: str) -> str:
        return QueryNormalizer.normalize(nl_query)

    def normalize_payload(
        self,
        assistant_payload_dict: dict[str, str],
        normalize_query: bool = True,
    ) -> tuple[str, dict[str, str], str]:

        placeholder_map: dict[str, str] = {}

        sparql = assistant_payload_dict.get("sparql", "") or ""
        if sparql and normalize_query:
            normalizer = SPARQLNormalizer()
            sparql, sparql_placeholders = normalizer.normalize(
                sparql_query=sparql,
                normalize_query=True,
            )
            assistant_payload_dict["sparql"] = sparql
            placeholder_map.update(
                {f"SPARQL::{key}": value for key, value in sparql_placeholders.items()}
            )

        normalized_payload = json.dumps(
            assistant_payload_dict,
            sort_keys=True,
        )
        query_type = assistant_payload_dict.get("source", "") or ""

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
