from typing import Any


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


def merge_federated_kv_results(
    sparql_kv: dict[str, Any],
    sql_kv: dict[str, Any],
) -> dict[str, Any]:
    sparql_rows = _kv_rows(sparql_kv)
    sql_rows = _kv_rows(sql_kv)

    sparql_time_key = _find_time_key(sparql_rows)
    sql_time_key = _find_time_key(sql_rows)

    if sparql_time_key and sql_time_key:
        data = (
            _time_series_rows(sparql_rows, sparql_time_key, "sparql")
            + _time_series_rows(sql_rows, sql_time_key, "sql")
        )

        data = sorted(data, key=lambda row: (row["date"], row["source"], row["metric"]))

        return {
            "result_type": "multiple",
            "count": len(data),
            "data": data,
            "metadata": {
                "source": "federated",
                "shape": "time_series_long",
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