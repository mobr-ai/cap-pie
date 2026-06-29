import re
from typing import Any

# Cardanoscan base URLs
CARDANOSCAN_BASE = "https://cardanoscan.io"

PROPERTY_TO_ENTITY = {
    "hasBlockNumber": "block",
    "hasTxID": "transaction",
    "hasEpochNumber": "epoch",
    "hasAddressId": "address",
    "hasPolicyId": "policy",
}


def _normalize_query_text(sparql_query: Any) -> str:
    if isinstance(sparql_query, list):
        return " ".join(
            q.get("query", "") if isinstance(q, dict) else str(q)
            for q in sparql_query
        )

    if isinstance(sparql_query, dict):
        return sparql_query.get("query", str(sparql_query))

    return str(sparql_query or "")


def _subject_has_block_context(subject: str, query_text: str) -> bool:
    block_context_props = (
        "hasBlockNumber",
        "hasTxCount",
        "hasTimestamp",
        "hasTx",
    )

    return any(
        re.search(
            rf"{re.escape(subject)}\s+(?:b:|c:)?{prop}\b",
            query_text,
            re.IGNORECASE,
        )
        for prop in block_context_props
    )


def _detect_entity_from_ontology(var_name: str, sparql_query: str) -> str | None:
    query_text = _normalize_query_text(sparql_query)
    if not query_text:
        return None

    var = var_name.lstrip("?")

    # Strong hint from result variable names.
    var_lower = var.lower()
    if "block" in var_lower and "hash" in var_lower:
        return "block"
    if "tx" in var_lower and ("hash" in var_lower or "id" in var_lower):
        return "transaction"
    if "policy" in var_lower:
        return "policy"
    if "address" in var_lower:
        return "address"
    if "epoch" in var_lower:
        return "epoch"

    # Direct ontology-property mapping.
    for property_name, entity_type in PROPERTY_TO_ENTITY.items():
        patterns = [
            rf"(?:b:|c:)?{property_name}\s+\?{re.escape(var)}\b",
        ]

        if any(re.search(pattern, query_text, re.IGNORECASE) for pattern in patterns):
            return entity_type

    # Special case: hasHash is shared. Detect block hash by the subject context:
    # ?block b:hasHash ?block_hash ;
    #        c:hasBlockNumber ?block_number ;
    #        b:hasTimestamp ?timestamp .
    hash_patterns = [
        rf"(?P<subject>\?\w+)\s+(?:b:|c:)?hasHash\s+\?{re.escape(var)}\b",
    ]

    for pattern in hash_patterns:
        match = re.search(pattern, query_text, re.IGNORECASE)
        if not match:
            continue

        subject = match.group("subject")

        if "block" in subject.lower() or _subject_has_block_context(subject, query_text):
            return "block"

        if "pool" in subject.lower():
            return "pool"

    return None


def _extract_plain_value(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("value", value.get("decoded", value))

    return str(value).strip()


def _find_block_number(row_context: dict[str, Any] | None) -> str | None:
    if not row_context:
        return None

    for key, value in row_context.items():
        key_lower = key.lower()
        if "block" in key_lower and "number" in key_lower:
            block_number = _extract_plain_value(value)
            return block_number if block_number else None

    return None


def _is_hex(value: str, length: int | None = None) -> bool:
    if length is not None and len(value) != length:
        return False
    return bool(re.fullmatch(r"[0-9a-fA-F]+", value))


def _detect_entity_from_result_context(
    col_name: str,
    value: Any,
    row_context: dict[str, Any] | None = None,
) -> str | None:
    value_clean = _extract_plain_value(value)
    col_lower = col_name.lstrip("?").lower()

    if not value_clean:
        return None

    if value_clean.startswith(("addr1", "stake1")):
        return "address"

    if value_clean.startswith("pool1"):
        return "pool"

    if "metadata" in col_lower and _is_hex(value_clean, 64):
        return "metadata"

    if "address" in col_lower or "addr" in col_lower or "stake" in col_lower:
        return "address"

    if "pool" in col_lower:
        return "pool" if value_clean.startswith("pool1") else None

    if "policy" in col_lower:
        return "policy" if _is_hex(value_clean, 56) else None

    if "epoch" in col_lower:
        return "epoch" if value_clean.isdigit() else None

    if "block" in col_lower:
        if "hash" in col_lower:
            return "block" if _find_block_number(row_context) else None
        return "block" if value_clean.isdigit() else None

    if (
        "transaction" in col_lower
        or "txhash" in col_lower
        or "tx_hash" in col_lower
        or "txid" in col_lower
        or "tx_id" in col_lower
    ):
        return "transaction" if _is_hex(value_clean, 64) else None

    return None


def convert_entity_to_cardanoscan_link(
    var_name: str,
    value: Any,
    row_context: dict[str, Any] | None = None,
) -> str:
    if value is None:
        return ""

    value_clean = _extract_plain_value(value)

    if value_clean.startswith("<a href="):
        return value_clean

    entity_type = _detect_entity_from_result_context(
        var_name,
        value_clean,
        row_context=row_context,
    )

    if not entity_type:
        return value_clean

    block_url_value = value_clean

    if entity_type == "block" and "hash" in var_name.lower():
        block_number = _find_block_number(row_context)
        if not block_number:
            return value_clean
        block_url_value = block_number

    url_map = {
        "transaction": f"{CARDANOSCAN_BASE}/transaction/{value_clean}",
        "block": f"{CARDANOSCAN_BASE}/block/{block_url_value}",
        "epoch": f"{CARDANOSCAN_BASE}/epoch/{value_clean}",
        "address": f"{CARDANOSCAN_BASE}/address/{value_clean}",
        "pool": f"{CARDANOSCAN_BASE}/pool/{value_clean}",
        "policy": f"{CARDANOSCAN_BASE}/tokenPolicy/{value_clean}",
        "metadata": f"{CARDANOSCAN_BASE}/transaction/{value_clean}#metadata",
    }

    url = url_map.get(entity_type)
    if not url:
        return value_clean

    display_value = value_clean
    if entity_type in {"transaction", "block", "metadata", "policy"} and len(value_clean) > 19:
        display_value = f"{value_clean[:8]}...{value_clean[-8:]}"

    return f'<a href="{url}" target="_blank" title="{value_clean}">{display_value}</a>'
