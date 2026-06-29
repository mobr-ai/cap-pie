from typing import Any, Protocol

from fastapi import APIRouter


class QueryCanonizer(Protocol):
    def normalize_nl(self, nl_query: str) -> str: ...

    def normalize_payload(
        self,
        assistant_payload_dict: dict[str, str],
        normalize_query: bool = True,
    ) -> tuple[str, dict[str, str], str]: ...

    def restore_payload(
        self,
        payload: str,
        placeholder_map: dict[str, str],
        current_values: dict[str, list[str]],
    ) -> str: ...

    def extract_values(self, original_query: str) -> dict[str, list[str]]: ...


class ChainModule(Protocol):
    chain_name: str
    display_name: str

    def sparql_prefixes(self) -> dict[str, str]: ...

    def default_nl_to_sparql_prompt(self) -> str: ...

    def default_chart_prompt(self) -> str: ...

    def sync_status_query(self) -> str: ...

    def detect_amount_variables(self, sparql_query: str) -> set[str]: ...

    def detect_token_name_variables(self, sparql_query: str) -> set[str]: ...

    def query_canonizer(self) -> QueryCanonizer | None: ...

    def api_routers(self) -> list[APIRouter]: ...

    def admin_api_routers(self) -> list[APIRouter]: ...

    def convert_entity_to_explorer_link(
        self,
        var_name: str,
        value: Any,
    ) -> str: ...

    def convert_result_value(
        self,
        var_name: str,
        value: Any,
        sparql_query: str = "",
    ) -> Any: ...

    def format_result_value(self, value: Any) -> str | None: ...

    def format_axis_value(self, key: str, value: Any) -> str: ...
