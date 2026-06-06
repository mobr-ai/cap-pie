from typing import Any
from datetime import date, datetime
from decimal import Decimal

def sql_chart_safe_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)

    if isinstance(value, datetime | date):
        return value.isoformat()

    if isinstance(value, dict):
        return {k: sql_chart_safe_value(v) for k, v in value.items()}

    if isinstance(value, list):
        return [sql_chart_safe_value(v) for v in value]

    return value


def normalize_sql_results(sql_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {key: sql_chart_safe_value(value) for key, value in row.items()}
        for row in sql_results
    ]