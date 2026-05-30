import copy
import logging
from typing import Any

from cap.chains.registry import get_chain
from cap.util.str_util import hex_to_string, is_hex_string

logger = logging.getLogger(__name__)


def convert_sparql_to_kv(
    sparql_results: dict,
    sparql_query: str = "",
) -> dict[str, Any]:
    if not sparql_results:
        return {}

    chain = get_chain()
    token_name_variables = chain.detect_token_name_variables(sparql_query)

    if "boolean" in sparql_results:
        return {
            "result_type": "boolean",
            "value": sparql_results["boolean"],
        }

    if "results" not in sparql_results or "bindings" not in sparql_results["results"]:
        logger.warning("Unexpected SPARQL result structure")
        return {"raw_results": sparql_results}

    bindings = copy.deepcopy(sparql_results["results"]["bindings"])

    if not bindings:
        return {
            "result_type": "empty",
            "message": "No results found",
        }

    if len(bindings) == 1:
        return {
            "result_type": "single",
            "count": 1,
            "data": _flatten_binding(
                bindings[0],
                token_name_variables=token_name_variables,
                sparql_query=sparql_query,
            ),
        }

    return {
        "result_type": "multiple",
        "count": len(bindings),
        "data": [
            _flatten_binding(
                binding,
                token_name_variables=token_name_variables,
                sparql_query=sparql_query,
            )
            for binding in bindings
        ],
    }


def _convert_value(value: str, datatype: str = "", value_type: str = "literal") -> Any:
    if value_type == "uri":
        return {
            "type": "uri",
            "value": value,
        }

    if datatype:
        datatype_lower = datatype.lower()

        if any(t in datatype_lower for t in ("integer", "int", "long", "short", "byte")):
            try:
                return int(value)
            except (ValueError, TypeError):
                return value

        if any(t in datatype_lower for t in ("decimal", "float", "double")):
            try:
                return float(value)
            except (ValueError, TypeError):
                return value

        if "boolean" in datatype_lower:
            return str(value).lower() == "true"

        if "datetime" in datatype_lower or "date" in datatype_lower:
            return {
                "type": "datetime",
                "value": value,
            }

        if "duration" in datatype_lower:
            return {
                "type": "duration",
                "value": value,
            }

    return value


def _flatten_binding(
    binding: dict[str, Any],
    token_name_variables: set[str] | None = None,
    sparql_query: str = "",
) -> dict[str, Any]:
    token_name_variables = token_name_variables or set()
    chain = get_chain()
    result: dict[str, Any] = {}

    for var_name, value_obj in binding.items():
        if not isinstance(value_obj, dict):
            result[var_name] = value_obj
            continue

        value = value_obj.get("value", "")
        datatype = value_obj.get("datatype", "")
        value_type = value_obj.get("type", "literal")

        converted_value = _convert_value(value, datatype, value_type)
        converted_value = chain.convert_result_value(
            var_name=var_name,
            value=converted_value,
            sparql_query=sparql_query,
        )

        if var_name in token_name_variables and isinstance(converted_value, str):
            if is_hex_string(converted_value):
                converted_value = {
                    "hex": converted_value,
                    "decoded": hex_to_string(converted_value),
                    "type": "token_name",
                }

        result[var_name] = converted_value

    return result

