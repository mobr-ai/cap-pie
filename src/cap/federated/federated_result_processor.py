import json
from typing import Any

from cap.services.vega.facade import VegaConverter


def _kv_rows(kv: dict[str, Any]) -> list[dict[str, Any]]:
    data = kv.get("data")

    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]

    if isinstance(data, dict):
        return [data]

    return []


def _is_time_key(key: str) -> bool:
    key_lower = key.lower()
    return key_lower in {"date", "day", "ts", "timestamp", "timeperiod"} or "date" in key_lower


def _normalize_time_value(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("value", "")

    value = str(value)

    if "T" in value:
        return value.split("T", 1)[0]

    if " " in value:
        return value.split(" ", 1)[0]

    return value


def _find_time_key(rows: list[dict[str, Any]]) -> str | None:
    if not rows:
        return None

    for row in rows:
        for key in row.keys():
            if _is_time_key(key):
                return key

    return None


def _is_numeric_value(value: Any) -> bool:
    if isinstance(value, bool):
        return False

    if isinstance(value, int | float):
        return True

    if isinstance(value, dict):
        value = value.get("value")

    if isinstance(value, str):
        try:
            float(value)
            return True
        except ValueError:
            return False

    return False


def _to_number(value: Any) -> int | float | None:
    if isinstance(value, dict):
        value = value.get("value")

    if isinstance(value, bool):
        return None

    if isinstance(value, int | float):
        return value

    if isinstance(value, str):
        try:
            parsed = float(value)
            return int(parsed) if parsed.is_integer() else parsed
        except ValueError:
            return None

    return None


def _metric_label(source: str, key: str) -> str:
    key_lower = key.lower()

    if source == "sparql":
        if "tps" in key_lower:
            return "Average TPS"
        return key

    if source == "sql":
        if key_lower in {"close", "price", "ada_price", "adaPrice"}:
            return "ADA Price"
        return key

    return key


def _time_series_rows(
    rows: list[dict[str, Any]],
    time_key: str,
    source: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    for row in rows:
        date_key = _normalize_time_value(row.get(time_key))

        for key, raw_value in row.items():
            if key == time_key:
                continue

            if not _is_numeric_value(raw_value):
                continue

            value = _to_number(raw_value)
            if value is None:
                continue

            out.append(
                {
                    "date": date_key,
                    "metric": _metric_label(source, key),
                    "value": value,
                    "source": source,
                }
            )

    return out


def format_kv(result_type: Any, user_query: str, federated_query: str, kv_results: dict) -> tuple[str, str]:
    if result_type:
        kv_results["result_type"] = result_type

        if result_type in VegaConverter.known_types:
            vega_data = VegaConverter.convert_to_vega_format(
                kv_results,
                user_query,
                federated_query,
            )

            columns = []
            if kv_results.get("data"):
                if isinstance(kv_results["data"], list):
                    columns = VegaConverter._all_keys(kv_results["data"])
                elif isinstance(kv_results["data"], dict):
                    columns = list(kv_results["data"].keys())

            metadata_columns = vega_data.get("_columns")
            formatted_columns = (
                metadata_columns
                if metadata_columns
                else [VegaConverter._format_column_name(col) for col in columns]
            )

            vega_data = {k: v for k, v in vega_data.items() if not k.startswith("_")}

            output_data = {
                "result_type": result_type,
                "data": vega_data,
                "metadata": {
                    "count": kv_results.get("count", 0),
                    "columns": formatted_columns,
                },
            }
            return json.dumps(output_data, indent=2), result_type

    return json.dumps(kv_results, indent=2), result_type


def merge_federated_kv_results(
    sparql_kv: dict[str, Any],
    sql_kv: dict[str, Any],
) -> dict[str, Any]:
    sparql_rows = _kv_rows(sparql_kv)
    sql_rows = _kv_rows(sql_kv)

    sparql_time_key = _find_time_key(sparql_rows)
    sql_time_key = _find_time_key(sql_rows)

    if sparql_time_key and sql_time_key:
        by_date: dict[str, dict[str, Any]] = {}

        for row in sparql_rows:
            date_key = _normalize_time_value(row.get(sparql_time_key))
            out_row = by_date.setdefault(date_key, {"date": date_key})

            for key, raw_value in row.items():
                if key == sparql_time_key:
                    continue

                if not _is_numeric_value(raw_value):
                    continue

                value = _to_number(raw_value)
                if value is not None:
                    out_row[key] = value

        for row in sql_rows:
            date_key = _normalize_time_value(row.get(sql_time_key))
            out_row = by_date.setdefault(date_key, {"date": date_key})

            for key, raw_value in row.items():
                if key == sql_time_key:
                    continue

                if not _is_numeric_value(raw_value):
                    continue

                value = _to_number(raw_value)
                if value is not None:
                    out_row[key] = value

        data = sorted(by_date.values(), key=lambda row: row["date"])

        return {
            "result_type": "multiple",
            "count": len(data),
            "data": data,
            "metadata": {
                "source": "federated",
                "shape": "time_series_wide",
            },
        }

    data = [
        {**row, "source": "sparql"} for row in sparql_rows
    ] + [
        {**row, "source": "sql"} for row in sql_rows
    ]

    return {
        "result_type": "multiple",
        "count": len(data),
        "data": data,
        "metadata": {"source": "federated"},
    }
