from typing import Any

from fastapi import APIRouter

from cap.chains.cardano.api.auth import router as auth_router
from cap.chains.cardano.api.billing import router as billing_router
from cap.chains.cardano.api.billing_admin import router as billing_admin_router
from cap.chains.cardano.canonizer import CardanoQueryCanonizer
from cap.chains.cardano.epoch import epoch_to_date
from cap.chains.cardano.explorer import convert_entity_to_cardanoscan_link
from cap.chains.cardano.currency import (
    ADA_CURRENCY_URI,
    convert_cardano_result_value,
    detect_ada_variables,
    format_cardano_result_value,
)
from cap.chains.cardano.sparql import CARDANO_PREFIXES


class CardanoChainModule:
    chain_name = "cardano"
    display_name = "Cardano"

    def sparql_prefixes(self) -> dict[str, str]:
        return CARDANO_PREFIXES

    def default_nl_to_sparql_prompt(self) -> str:
        return "Convert the following natural language query to SPARQL for Cardano blockchain data."

    def default_chart_prompt(self) -> str:
        return "You are a blockchain analytics chart analyzer."

    def detect_amount_variables(self, sparql_query: str) -> set[str]:
        return detect_ada_variables(sparql_query)

    def detect_token_name_variables(self, sparql_query: str) -> set[str]:
        from cap.chains.cardano.token import detect_token_name_variables

        return detect_token_name_variables(sparql_query)

    def sync_status_query(self) -> str:
        return """
            PREFIX b: <https://mobr.ai/ont/blockchain#>
            PREFIX c: <https://mobr.ai/ont/cardano#>
            SELECT ?currentChainHeight (MAX(?blockNum) AS ?indexedBlockNum) (COUNT(?block) AS ?count)
            WHERE {
                c:Cardano c:hasBlockNumber ?currentChainHeight .
                ?block a b:Block .
                ?block c:hasBlockNumber ?blockNum .
            }
            GROUP BY ?currentChainHeight
            LIMIT 1
        """

    def convert_entity_to_explorer_link(
        self,
        var_name: str,
        value: Any,
        sparql_query: str = "",
    ) -> str:
        return convert_entity_to_cardanoscan_link(var_name, value, sparql_query)

    def convert_result_value(
        self,
        var_name: str,
        value: Any,
        sparql_query: str = "",
    ) -> Any:
        return convert_cardano_result_value(var_name, value, sparql_query)

    def format_result_value(self, value: Any) -> str | None:
        return format_cardano_result_value(value)

    def format_axis_value(self, key: str, value: Any) -> str:
        if "epoch" in key.lower():
            try:
                return epoch_to_date(int(float(value)))
            except (TypeError, ValueError):
                return str(value)
        return str(value) if value is not None else ""

    def query_canonizer(self) -> CardanoQueryCanonizer:
        return CardanoQueryCanonizer()

    def api_routers(self) -> list[APIRouter]:
        return [auth_router, billing_router]

    def admin_api_routers(self) -> list[APIRouter]:
        return [billing_admin_router]
