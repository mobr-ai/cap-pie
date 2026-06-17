import logging
from typing import Any

from cap.chains.registry import get_chain

logger = logging.getLogger(__name__)

class VegaTableConverter:
    @classmethod
    def _convert_table(cls, data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to table format."""

        # Forcing list for one count results
        table_data = data
        if isinstance(data, dict):
            table_data = [data]

        if not isinstance(table_data, list) or len(table_data) == 0:
            logger.warning(f"Returning empty table for {user_query} with data {table_data}")
            return {"context": {}, "values": []}

        all_keys = cls._all_keys(table_data)
        formatted_rows: list[dict[str, Any]] = []

        for row in table_data:
            formatted_row: dict[str, Any] = {}

            for col_name in all_keys:
                value = row.get(col_name, "")

                # Handle nested structures
                if isinstance(value, dict):
                    formatted = get_chain().format_result_value(value)
                    if formatted is not None:
                        value = formatted
                    elif "decoded" in value and "hex" in value:
                        value = value["decoded"]
                    elif "value" in value:
                        value = value["value"]
                    else:
                        value = str(value)

                value = get_chain().convert_entity_to_explorer_link(
                    col_name,
                    value,
                    sparql_query,
                    row_context=row,
                )

                v_dt = cls._parse_date_value(value)
                value = v_dt.strftime("%d/%b/%y %Hh") if v_dt else value

                if not str(value).startswith('<a href='):
                    value = cls._convert_url_to_link(value)

                formatted_row[col_name] = value

            formatted_rows.append(formatted_row)

        context: dict[str, Any] = {}
        value_columns: list[dict[str, Any]] = []
        _columns: list[str] = []

        visible_col_idx = 1
        for col_name in all_keys:
            col_values = [row[col_name] for row in formatted_rows]
            unique_values = set(map(str, col_values))

            if len(unique_values) == 1:
                context[col_name] = col_values[0]
                continue

            _col_name = cls._format_column_name(col_name)
            _columns.append(_col_name)
            value_columns.append({
                f"col{visible_col_idx}": _col_name,
                "values": col_values,
            })

            visible_col_idx += 1

        return {
            "context": context,
            "values": value_columns,
            "_columns": _columns,
        }
