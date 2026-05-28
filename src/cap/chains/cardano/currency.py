import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger(__name__)

ADA_CURRENCY_URI = "https://mobr.ai/ont/cardano#cnt/ada"
LOVELACE_TO_ADA = Decimal("1000000")


def _query_text(sparql_query: str | list | dict) -> str:
    if isinstance(sparql_query, list):
        return " ".join(
            q.get("query", "") if isinstance(q, dict) else str(q)
            for q in sparql_query
        )
    if isinstance(sparql_query, dict):
        return sparql_query.get("query", str(sparql_query))
    return sparql_query or ""


def detect_ada_variables(sparql_query: str | list | dict) -> set[str]:
    query_text = _query_text(sparql_query)
    if not query_text:
        return set()

    ada_vars: set[str] = set()
    lines = query_text.splitlines()

    for i, line in enumerate(lines):
        context = "\n".join(lines[max(0, i - 3): min(len(lines), i + 4)])

        if ADA_CURRENCY_URI in line:
            ada_vars.update(
                re.findall(
                    r"(?:hasValue|hasTotalSupply|hasMaxSupply)\s+\?(\w+)",
                    context,
                    re.IGNORECASE,
                )
            )

        ada_vars.update(
            re.findall(
                r"(?:hasFee|hasTxOutputValue)\s+\?(\w+)",
                context,
                re.IGNORECASE,
            )
        )

    changed = True
    while changed:
        before = len(ada_vars)

        for source_var, alias_var in re.findall(
            r"\(\s*\?(\w+)\s+AS\s+\?(\w+)\s*\)",
            query_text,
            re.IGNORECASE,
        ):
            if source_var in ada_vars:
                ada_vars.add(alias_var)

        for source_var, result_var in re.findall(
            r"(?:SUM|AVG|MIN|MAX)\s*\(\s*(?:COALESCE\s*\(\s*)?\?(\w+)[^)]*\)\s+AS\s+\?(\w+)",
            query_text,
            re.IGNORECASE,
        ):
            if source_var in ada_vars:
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
    if not isinstance(value, str):
        return value

    if var_name not in detect_ada_variables(sparql_query):
        return value

    try:
        Decimal(value)
    except (InvalidOperation, ValueError):
        return value

    return convert_lovelace_to_ada(value)


def format_cardano_result_value(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None

    if "lovelace" in value and "ada" in value:
        return f"{value.get('ada', '')} ADA"

    return None
