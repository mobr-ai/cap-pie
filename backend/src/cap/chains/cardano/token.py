import logging
import re

logger = logging.getLogger(__name__)


def _query_text(sparql_query: str | list | dict) -> str:
    if isinstance(sparql_query, list):
        return " ".join(
            q.get("query", "") if isinstance(q, dict) else str(q)
            for q in sparql_query
        )
    if isinstance(sparql_query, dict):
        return sparql_query.get("query", str(sparql_query))
    return sparql_query or ""


def detect_token_name_variables(sparql_query: str | list | dict) -> set[str]:
    query_text = _query_text(sparql_query)
    if not query_text:
        return set()

    token_name_vars: set[str] = set()

    for pattern in (
        r"hasTokenName\s+\?(\w+)",
        r"b:hasTokenName\s+\?(\w+)",
        r"c:hasTokenName\s+\?(\w+)",
    ):
        token_name_vars.update(re.findall(pattern, query_text, re.IGNORECASE))

    changed = True
    while changed:
        before = len(token_name_vars)

        for source_var, alias_var in re.findall(
            r"\(\s*\?(\w+)\s+AS\s+\?(\w+)\s*\)",
            query_text,
            re.IGNORECASE,
        ):
            if source_var in token_name_vars:
                token_name_vars.add(alias_var)

        changed = len(token_name_vars) != before

    return token_name_vars
