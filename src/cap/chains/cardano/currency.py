import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger(__name__)

ADA_CURRENCY_URI = "https://mobr.ai/ont/cardano#cnt/ada"
LOVELACE_TO_ADA = Decimal("1000000")


def _query_text(sparql_query: str | list[Any] | dict[str, Any]) -> str:
    if isinstance(sparql_query, list):
        return " ".join(
            q.get("query", "") if isinstance(q, dict) else str(q)
            for q in sparql_query
        )
    if isinstance(sparql_query, dict):
        query = sparql_query.get("query")
        return query if isinstance(query, str) else str(sparql_query)
    return sparql_query or ""


def detect_ada_variables(sparql_query: str | list[Any] | dict[str, Any]) -> set[str]:
    query_text = _query_text(sparql_query)
    if not query_text:
        return set()

    ada_vars: set[str] = set()

    direct_amount_predicates = (
        "hasFee",
        "hasTxOutputValue",
        "hasValue",
        "hasTotalSupply",
        "hasMaxSupply",
    )
    predicate_pattern = "|".join(re.escape(p) for p in direct_amount_predicates)

    for match in re.finditer(
        rf"(?:{predicate_pattern})\s+\?(\w+)",
        query_text,
        re.IGNORECASE,
    ):
        ada_vars.add(match.group(1))

    lines = query_text.splitlines()
    for i, line in enumerate(lines):
        if ADA_CURRENCY_URI not in line:
            continue

        context = "\n".join(lines[max(0, i - 5): min(len(lines), i + 6)])
        for match in re.finditer(
            r"(?:hasValue|hasTotalSupply|hasMaxSupply)\s+\?(\w+)",
            context,
            re.IGNORECASE,
        ):
            ada_vars.add(match.group(1))

    changed = True
    while changed:
        before = len(ada_vars)

        # Projection alias:
        # (?source AS ?alias)
        for source_var, alias_var in re.findall(
            r"\(\s*\?(\w+)\s+AS\s+\?(\w+)\s*\)",
            query_text,
            re.IGNORECASE,
        ):
            if source_var in ada_vars:
                ada_vars.add(alias_var)

        # BIND expressions:
        # BIND(?value AS ?x)
        # BIND(COALESCE(?value, 0) AS ?x)
        # BIND(xsd:decimal(?value) AS ?x)
        # BIND((?value / 1000000) AS ?x)
        for expr, result_var in re.findall(
            r"BIND\s*\(\s*(.*?)\s+AS\s+\?(\w+)\s*\)",
            query_text,
            re.IGNORECASE | re.DOTALL,
        ):
            source_vars = re.findall(r"\?(\w+)", expr)
            if any(source_var in ada_vars for source_var in source_vars):
                ada_vars.add(result_var)

        # Aggregate expressions:
        # SUM(?value) AS ?total
        # SUM(COALESCE(?value, 0)) AS ?total
        # SUM(xsd:decimal(?value)) AS ?total
        # AVG(COALESCE(xsd:decimal(?fee), 0)) AS ?avgFee
        for expr, result_var in re.findall(
            r"(?:SUM|AVG|MIN|MAX)\s*\((.*?)\)\s+AS\s+\?(\w+)",
            query_text,
            re.IGNORECASE | re.DOTALL,
        ):
            source_vars = re.findall(r"\?(\w+)", expr)
            if any(source_var in ada_vars for source_var in source_vars):
                ada_vars.add(result_var)

        changed = len(ada_vars) != before

    return ada_vars


def convert_lovelace_to_ada(value: str) -> dict[str, Any]:
    try:
        lovelace = Decimal(str(value))
        return {
            "lovelace": str(value),
            "ada": str(lovelace / LOVELACE_TO_ADA),
        }
    except (ValueError, TypeError, InvalidOperation):
        return {"lovelace": str(value).split(".")[0]}


def convert_cardano_result_value(
    var_name: str,
    value: Any,
    sparql_query: str = "",
) -> Any:
    if var_name not in detect_ada_variables(sparql_query):
        return value

    if not isinstance(value, (str, int, float, Decimal)):
        return value

    try:
        Decimal(str(value))
    except (InvalidOperation, ValueError):
        return value

    return convert_lovelace_to_ada(str(value))


def format_cardano_result_value(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None

    if "lovelace" in value and "ada" in value:
        return f"{value.get('ada', '')} ADA"

    return None
