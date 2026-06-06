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

    keys = rows[0].keys()
    return next((key for key in keys if _is_time_key(key)), None)


def merge_federated_kv_results(
    sparql_kv: dict[str, Any],
    sql_kv: dict[str, Any],
) -> dict[str, Any]:
    sparql_rows = _kv_rows(sparql_kv)
    sql_rows = _kv_rows(sql_kv)

    sparql_time_key = _find_time_key(sparql_rows)
    sql_time_key = _find_time_key(sql_rows)

    if not sparql_time_key or not sql_time_key:
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

    merged_by_date: dict[str, dict[str, Any]] = {}

    for row in sparql_rows:
        date_key = _normalize_time_value(row.get(sparql_time_key))
        merged_by_date.setdefault(date_key, {"date": date_key})

        for key, value in row.items():
            if key != sparql_time_key:
                merged_by_date[date_key][key] = value

    for row in sql_rows:
        date_key = _normalize_time_value(row.get(sql_time_key))
        merged_by_date.setdefault(date_key, {"date": date_key})

        for key, value in row.items():
            if key != sql_time_key:
                target_key = key
                if target_key in merged_by_date[date_key]:
                    target_key = f"sql_{key}"
                merged_by_date[date_key][target_key] = value

    data = sorted(merged_by_date.values(), key=lambda row: row["date"])

    all_keys: list[str] = []
    for row in data:
        for key in row.keys():
            if key not in all_keys:
                all_keys.append(key)

    data = [
        {key: row.get(key) for key in all_keys}
        for row in data
    ]

    return {
        "result_type": "multiple",
        "count": len(data),
        "data": data,
        "metadata": {"source": "federated"},
    }