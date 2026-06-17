import logging
import re
from datetime import datetime
from collections import Counter
from dataclasses import dataclass
from typing import Any, TypeAlias

from opentelemetry import trace

from cap.chains.registry import get_chain

DataRow: TypeAlias = dict[str, Any]
VegaValue: TypeAlias = dict[str, Any]

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


@dataclass(frozen=True)
class ChartFields:
    keys: list[str]
    categorical_keys: list[str]
    numeric_keys: list[str]
    assignments: dict[str, str]


class VegaUtil:
    """Util to convert data to vega format."""

    x_candidates = [
        'yearMonth', 'year', 'month', 'date', 'timePeriod', 'timestamp', 'ts',
        'epoch', 'epochNumber', 'x', 'index', 'blockHeight', 'blockNumber',
        'name', 'label', 'category'
    ]

    known_types = {
        "bar_chart",
        "pie_chart",
        "line_chart",
        "scatter_chart",
        "bubble_chart",
        "treemap",
        "heatmap",
        "table",
    }

    @staticmethod
    def convert_to_vega_format(
        kv_results: dict[str, Any],
        user_query: str,
        sparql_query: str
    ) -> dict[str, Any]:
        """
        Convert kv_results to Vega-compatible format based on result_type and data structure.
        """
        result_type = kv_results.get("result_type", "")
        data = kv_results.get("data", [])

        if not data:
            return {"values": []}

        converters = {
            "bar_chart": VegaUtil._convert_bar_chart,
            "pie_chart": VegaUtil._convert_pie_chart,
            "line_chart": VegaUtil._convert_line_chart,
            "table": VegaUtil._convert_table,
            "scatter_chart": VegaUtil._convert_scatter_chart,
            "bubble_chart": VegaUtil._convert_bubble_chart,
            "treemap": VegaUtil._convert_treemap,
            "heatmap": VegaUtil._convert_heatmap,
        }

        converter = converters.get(result_type)
        if not converter:
            return {"values": []}

        try:
            return converter(data, user_query, sparql_query)
        except Exception as e:
            logger.error(f"Error converting to Vega format: {e}")
            return {"values": []}

    @staticmethod
    def _is_numeric_value(value: Any) -> bool:
        """
        Determine if a value should be treated as numeric for visualization purposes.
        """
        if isinstance(value, dict):
            datatype = str(value.get("datatype", "")).lower()
            literal_type = str(value.get("type", "")).lower()

            if literal_type == "literal" and any(t in datatype for t in (
                "int", "integer", "decimal", "float", "double",
                "long", "short", "byte", "nonnegativeinteger", "nonpositiveinteger",
                "positiveinteger", "negativeinteger"
            )):
                return True

        if isinstance(value, (int, float)):
            return True

        if isinstance(value, str):
            clean_val = value.strip()

            if not clean_val:
                return False

            if '-' in clean_val or '/' in clean_val:
                return False
            if ':' in clean_val:
                return False
            try:
                float(clean_val)
                return True
            except ValueError:
                return False

        return False

    @staticmethod
    def _all_keys(data: list[DataRow]) -> list[str]:
        keys: list[str] = []

        for item in data:
            if not isinstance(item, dict):
                continue

            for key in item.keys():
                if key not in keys:
                    keys.append(key)

        return keys

    @staticmethod
    def _first_value_for_key(data: list[DataRow], key: str) -> Any:
        for item in data:
            if not isinstance(item, dict):
                continue

            value = item.get(key)

            if value is not None:
                return value

        return None

    @staticmethod
    def _is_numeric_field(data: list[DataRow], key: str) -> bool:
        return any(
            VegaUtil._is_numeric_value(item.get(key))
            for item in data
            if isinstance(item, dict) and item.get(key) is not None
        )

    @staticmethod
    def _classify_fields(data: list[DataRow]) -> tuple[list[str], list[str]]:
        if not data:
            return [], []

        categorical_keys = []
        numeric_keys = []

        for key in VegaUtil._all_keys(data):
            if VegaUtil._is_numeric_field(data, key):
                numeric_keys.append(key)
            else:
                categorical_keys.append(key)

        return categorical_keys, numeric_keys

    @staticmethod
    def _get_x_candidates(first_item: DataRow, keys: list[str]) -> list[str]:
        x_candidates = VegaUtil.x_candidates.copy()

        for k in keys:
            val = first_item.get(k)

            if 'date' in k.lower() and k.lower() not in [c.lower() for c in x_candidates]:
                x_candidates.append(k)
            elif (
                isinstance(val, dict)
                and val.get('type') == 'datetime'
                and k.lower() not in [c.lower() for c in x_candidates]
            ):
                x_candidates.append(k)

        return x_candidates

    @staticmethod
    def _parse_coordinate_assignments(user_query: str, data: list[DataRow]) -> dict[str, str]:
        """
        Parse user query to extract explicit coordinate assignments (x, y, z, size, color, etc.).

        This function analyzes the user's natural language query to identify which data fields
        should be mapped to which visual encoding channels (coordinates, size, color, etc.).

        Examples:
            "x = TPS, y = average fee" -> {"x": "TPS", "y": "average fee"}
            "bubble size = total volume" -> {"size": "total volume"}
            "positioned by votes and voters" -> {"x": "votes", "y": "voters"}
            "color by category" -> {"color": "category"}

        Args:
            user_query: The natural language query from the user
            data: The data list to match field names against

        Returns:
            Dictionary mapping coordinate names to field identifiers from the query
        """
        if not user_query or not data:
            return {}

        # Normalize query for parsing
        query_lower = user_query.lower()

        # Dictionary to store coordinate assignments
        coordinates: dict[str, str] = {}

        # Pattern 1: Direct assignments with "=" or "as" (e.g., "x = field name", "use y as volume")
        # Improved to handle multiple assignments better, including "x = A and y = B" format
        assignment_pattern = r'(?:use\s+)?(?:bubble\s+)?(?P<coord>x|y|z|size|color|colour|radius)\s*(?:=|as)\s*(?P<field>[^,=]+?)(?=\s+and\s+(?:use\s+)?(?:bubble\s+)?(?:x|y|z|size|color)|[,.\n]|and\s+bubble|$)'

        for match in re.finditer(assignment_pattern, query_lower):
            coord_name = match.group('coord').strip()
            field_desc = match.group('field').strip()

            # Clean up the field description
            field_desc = re.sub(r'\s+and\s*$', '', field_desc)  # Remove trailing "and"
            field_desc = field_desc.strip()

            # Normalize coordinate name
            if coord_name == 'colour':
                coord_name = 'color'
            if coord_name == 'radius':
                coord_name = 'size'

            coordinates[coord_name] = field_desc

        # Pattern 2: "positioned by X and Y" or "positioned by X, Y"
        positioned_pattern = r'positioned\s+by\s+(?P<fields>[^,.\n]+?)(?=[,.\n]|and\s+(?:bubble\s+)?size|with\s+(?:bubble\s+)?size|$)'
        positioned_match = re.search(positioned_pattern, query_lower)

        if positioned_match:
            fields_text = positioned_match.group('fields').strip()
            # Split by "and" or commas
            field_parts = re.split(r'\s+and\s+|,\s*', fields_text)

            # Assign to x and y coordinates
            if len(field_parts) >= 1 and 'x' not in coordinates:
                coordinates['x'] = field_parts[0].strip()
            if len(field_parts) >= 2 and 'y' not in coordinates:
                coordinates['y'] = field_parts[1].strip()

        # Pattern 3: "bubble size showing/from X" or "with bubble size showing X"
        bubble_size_patterns = [
            r'(?:bubble\s+)?size\s+(?:showing|from|representing|indicating)\s+(?P<field>[^,.\n]+?)(?=[,.\n]|$)',
            r'with\s+(?:bubble\s+)?size\s+(?:showing|from|representing|indicating)\s+(?P<field>[^,.\n]+?)(?=[,.\n]|$)'
        ]

        for pattern in bubble_size_patterns:
            bubble_match = re.search(pattern, query_lower)
            if bubble_match and 'size' not in coordinates:
                coordinates['size'] = bubble_match.group('field').strip()
                break

        # Pattern 4: "colored by X" or "color-coded by X"
        color_patterns = [
            r'(?:colored|colou?red|color[- ]coded)\s+by\s+(?P<field>[^,.\n]+?)(?=[,.\n]|$)',
            r'(?:by\s+)?colou?r\s+(?:of\s+)?(?P<field>[^,.\n]+?)(?=[,.\n]|$)'
        ]

        for pattern in color_patterns:
            color_match = re.search(pattern, query_lower)
            if color_match and 'color' not in coordinates:
                coordinates['color'] = color_match.group('field').strip()
                break

        return coordinates

    @staticmethod
    def _match_coordinate_to_field(
        coordinate_desc: str,
        data: list[DataRow],
        exclude_keys: list[str] | None = None
    ) -> str | None:

        if not data or not coordinate_desc:
            return None

        exclude_keys = exclude_keys or []
        available_keys = [k for k in VegaUtil._all_keys(data) if k not in exclude_keys]

        if not available_keys:
            return None

        # Normalize the description
        desc_lower = coordinate_desc.lower().strip()
        desc_words = set(re.findall(r'\w+', desc_lower))

        best_match = None
        best_score = 0

        for key in available_keys:
            key_lower = key.lower()

            # Score based on various matching criteria
            score = 0

            # Exact match (highest priority)
            if key_lower == desc_lower:
                score = 1000

            # Key contains the full description
            elif desc_lower in key_lower or key_lower in desc_lower:
                score = 100

            # Word-based matching
            else:
                # Split camelCase and snake_case
                key_words = set(re.findall(r'[a-z]+|[A-Z][a-z]*', key))
                key_words = {w.lower() for w in key_words if w}

                # Count matching words
                matching_words = desc_words & key_words
                if matching_words:
                    score = len(matching_words) * 10

                    # Bonus if all description words are in the key
                    if desc_words <= key_words:
                        score += 50

            # Special handling for common terms
            if score > 0:
                # Boost score for semantic matches
                semantic_matches = [
                    (['count', 'number', 'total'], ['count', 'num', 'total']),
                    (['unique', 'distinct'], ['unique', 'distinct']),
                    (['average', 'avg', 'mean'], ['average', 'avg', 'mean']),
                    (['volume', 'amount', 'sum'], ['volume', 'amount', 'sum', 'total']),
                    (['fee', 'fees', 'cost'], ['fee', 'fees', 'cost']),
                    (['size', 'magnitude'], ['size', 'count', 'total']),
                ]

                for desc_terms, key_terms in semantic_matches:
                    if any(term in desc_lower for term in desc_terms):
                        if any(term in key_lower for term in key_terms):
                            score += 20

            if score > best_score:
                best_score = score
                best_match = key

        # Only return a match if we have a reasonable score
        return best_match if best_score >= 10 else None

    @staticmethod
    def _apply_coordinate_mapping(data: list[DataRow], coordinate_map: dict[str, str]) -> dict[str, str]:
        """
        Apply coordinate mapping from parsed query to actual data fields.
        """
        if not coordinate_map or not data:
            return {}

        field_assignments: dict[str, str] = {}
        used_keys: list[str] = []

        # Priority order for assignment (x, y, z, size, color, etc.)
        priority_order = ['x', 'y', 'z', 'size', 'color']

        # First pass: assign priority coordinates
        for coord_name in priority_order:
            if coord_name in coordinate_map:
                field_key = VegaUtil._match_coordinate_to_field(
                    coordinate_map[coord_name],
                    data,
                    exclude_keys=used_keys
                )
                if field_key:
                    field_assignments[coord_name] = field_key
                    used_keys.append(field_key)

        # Second pass: assign any remaining coordinates
        for coord_name, coord_desc in coordinate_map.items():
            if coord_name not in field_assignments:
                field_key = VegaUtil._match_coordinate_to_field(
                    coord_desc,
                    data,
                    exclude_keys=used_keys
                )
                if field_key:
                    field_assignments[coord_name] = field_key
                    used_keys.append(field_key)

        return field_assignments

    @staticmethod
    def _format_column_name(column_name: str) -> str:
        """
        Convert camelCase/variable names to human-readable format.
        """
        # Split camelCase into words
        import re
        # Insert space before uppercase letters
        spaced = re.sub(r'([A-Z])', r' \1', column_name)
        # Split and capitalize each word
        words = spaced.split()

        if not words:
            return column_name

        # Capitalize all words
        formatted = ' '.join(word.capitalize() for word in words)
        return formatted.strip()

    @staticmethod
    def _prepare_fields(data: list[DataRow], user_query: str = "") -> ChartFields:
        """Collect reusable field metadata once per chart conversion."""
        keys = VegaUtil._all_keys(data)
        categorical_keys, numeric_keys = VegaUtil._classify_fields(data)
        coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
        assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)
        return ChartFields(keys, categorical_keys, numeric_keys, assignments)

    @staticmethod
    def _as_row_list(data: Any) -> list[DataRow]:
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return []

    @staticmethod
    def _literal_value(value: Any, default: Any = "") -> Any:
        """Return the display/raw literal from SPARQL-ish nested values."""
        if isinstance(value, dict):
            if "decoded" in value and "hex" in value:
                return value["decoded"]
            if "value" in value:
                return value["value"]
            return next(iter(value.values()), default)
        return default if value is None else value

    @staticmethod
    def _numeric_value(value: Any) -> float | None:
        value = VegaUtil._literal_value(value, None)
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _pick_first(keys: list[str], exclude: list[str] | None = None) -> str | None:
        exclude = exclude or []
        return next((key for key in keys if key not in exclude), None)

    @staticmethod
    def _pick_numeric(fields: ChartFields, exclude: list[str] | None = None) -> str | None:
        return VegaUtil._pick_first(fields.numeric_keys, exclude)

    @staticmethod
    def _pick_categorical(fields: ChartFields, exclude: list[str] | None = None) -> str | None:
        return VegaUtil._pick_first(fields.categorical_keys, exclude)

    @staticmethod
    def _pick_x_key(data: list[DataRow], fields: ChartFields, preferred: str | None = None) -> str | None:
        if preferred:
            return preferred
        if not fields.keys:
            return None

        first_item = data[0] if data else {}
        candidates = {candidate.lower() for candidate in VegaUtil._get_x_candidates(first_item, fields.keys)}
        return next((key for key in fields.keys if key.lower() in candidates), fields.keys[0])

    @staticmethod
    def _pick_named_key(fields: ChartFields, names: set[str], exclude: list[str] | None = None) -> str | None:
        exclude = exclude or []
        return next((k for k in fields.keys if k not in exclude and k.lower() in names), None)

    @staticmethod
    def _format_columns(*keys: str | None) -> list[str]:
        return [VegaUtil._format_column_name(key) for key in keys if key]

    @staticmethod
    def _build_xy_points(
        data: list[DataRow],
        x_key: str,
        y_key: str,
        *,
        category_key: str | None = None,
        size_key: str | None = None,
        category_output_key: str = "category",
    ) -> list[dict[str, Any]]:
        """Build reusable numeric x/y point rows for scatter and bubble charts."""
        values: list[dict[str, Any]] = []

        for item in data:
            x_val = VegaUtil._numeric_value(item.get(x_key))
            y_val = VegaUtil._numeric_value(item.get(y_key))

            if x_val is None or y_val is None:
                continue

            point: dict[str, Any] = {"x": x_val, "y": y_val}

            if size_key:
                size_val = VegaUtil._numeric_value(item.get(size_key))
                if size_val is None:
                    continue
                point["size"] = size_val

            if category_key:
                point[category_output_key] = VegaUtil._format_display_value(
                    item.get(category_key, ""),
                    category_key,
                )

            values.append(point)

        return values

    @staticmethod
    def _constant_context_and_columns(
        rows: list[dict[str, Any]],
        keys: list[str],
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Move columns with a single repeated value to context, keep varying columns as values."""
        context: dict[str, Any] = {}
        value_columns: list[dict[str, Any]] = []

        for idx, col_name in enumerate(keys):
            col_values = [row.get(col_name, "") for row in rows]
            unique_values = set(map(str, col_values))

            if len(unique_values) == 1:
                context[col_name] = col_values[0] if col_values else ""
            else:
                value_columns.append({f"col{idx + 1}": col_name, "values": col_values})

        return context, value_columns

    @staticmethod
    def _convert_bar_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to bar chart format."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        category_key = VegaUtil._pick_x_key(rows, fields, fields.assignments.get("x"))
        value_key = fields.assignments.get("y") or VegaUtil._pick_numeric(fields, [category_key] if category_key else [])
        value_key = value_key or (fields.keys[-1] if fields.keys else None)

        if not (category_key and value_key):
            return {"values": []}

        values = []
        for item in rows:
            amount = VegaUtil._numeric_value(item.get(value_key))
            if amount is None:
                logger.warning("Skipping bar chart entry: non-numeric amount")
                continue
            values.append({
                "category": VegaUtil._format_display_value(item.get(category_key, ""), category_key),
                "amount": amount,
            })

        return {"values": values}

    @staticmethod
    def _convert_pie_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to pie chart format."""
        if isinstance(data, dict):
            values = []
            for key, value in data.items():
                numeric_val = VegaUtil._numeric_value(value)
                if numeric_val is None:
                    continue
                if 0 <= numeric_val <= 1:
                    numeric_val *= 100
                values.append({"category": key, "value": numeric_val})
            if values:
                return {"values": values}

        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        category_key = (
            fields.assignments.get("x")
            or VegaUtil._pick_named_key(fields, {"category", "label", "name", "group"})
            or VegaUtil._pick_categorical(fields)
            or (fields.keys[0] if fields.keys else None)
        )
        value_key = fields.assignments.get("y") or VegaUtil._pick_numeric(fields, [category_key] if category_key else [])
        value_key = value_key or VegaUtil._pick_first(fields.keys, [category_key] if category_key else [])

        if not (category_key and value_key):
            return {"values": []}

        values = []
        for item in rows:
            val = VegaUtil._numeric_value(item.get(value_key))
            if val is None:
                logger.warning("Skipping pie chart entry: non-numeric value")
                continue
            values.append({
                "category": VegaUtil._format_display_value(item.get(category_key, ""), category_key),
                "value": val,
            })

        return {"values": values}

    @staticmethod
    def _detect_repetition_pattern(data: list[DataRow], x_key: str) -> int:
        """
        Detect if x values repeat consistently, indicating multiple series in one variable.
        """
        if len(data) < 2:
            return 1

        x_values = [str(VegaUtil._format_x_value(item.get(x_key), x_key)) for item in data]
        x_counts = Counter(x_values)
        unique_counts = set(x_counts.values())

        if len(unique_counts) == 1 and list(unique_counts)[0] > 1:
            return list(unique_counts)[0]
        return 1

    @staticmethod
    def _is_temporal_key(key: str) -> bool:
        key_lower = key.lower()
        return any(token in key_lower for token in ("time", "date", "timestamp", "hour", "ts"))

    @staticmethod
    def _format_display_value(value: Any, key: str) -> str:
        """Format values used as visual labels across all chart types."""
        value = VegaUtil._literal_value(value, "")
        if value is None:
            return ""
        if VegaUtil._is_temporal_key(key):
            return VegaUtil._format_temporal_value(value)
        return str(value)

    @staticmethod
    def _format_temporal_value(value: Any, include_time: bool = False) -> str:
        """Format datetime-like values consistently before chart-specific conversion."""
        value = VegaUtil._literal_value(value, "")

        if isinstance(value, datetime):
            dt = value
        else:
            value_str = str(value)
            try:
                dt = datetime.fromisoformat(value_str.replace("Z", "+00:00"))
            except ValueError:
                return value_str

        return dt.strftime("%d %b %Y %Hh") if include_time else dt.strftime("%d %b %Y")

    @staticmethod
    def _format_x_value(x_val: Any, x_key: str) -> str:
        """Extract and format x-axis value for charts."""
        x_val = VegaUtil._literal_value(x_val, "")

        if "epoch" in x_key.lower():
            try:
                epoch_num = int(float(x_val))
                return get_chain().format_axis_value(x_key, epoch_num)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to convert epoch {x_val}: {e}")
                return str(x_val)

        return VegaUtil._format_display_value(x_val, x_key)

    @staticmethod
    def _abbreviate_label(label: str, max_length: int = 11) -> str:
        """Abbreviate labels longer than max_length using ellipsis format."""
        if len(label) <= max_length:
            return label
        prefix_len = min(7, max_length - 7)
        suffix_len = 4
        return f"{label[:prefix_len]}...{label[-suffix_len:]}"

    @staticmethod
    def _series_label_key(data: list[DataRow], x_key: str, series_keys: list[str]) -> str | None:
        return next((k for k in VegaUtil._all_keys(data) if k != x_key and k not in series_keys), None)

    @staticmethod
    def _extract_series_labels(
        data: list[DataRow],
        x_key: str,
        series_keys: list[str],
        repetition_count: int,
    ) -> list[str]:
        """Extract series labels from repeating patterns in non-series columns."""
        if repetition_count <= 1:
            return []

        label_key = VegaUtil._series_label_key(data, x_key, series_keys)
        if not label_key:
            return [f"Series {i + 1}" for i in range(repetition_count)]

        labels: list[str] = []
        seen: set[str] = set()
        for item in data:
            label_str = str(VegaUtil._literal_value(item.get(label_key), ""))
            if label_str not in seen:
                seen.add(label_str)
                labels.append(VegaUtil._abbreviate_label(label_str))
                if len(labels) == repetition_count:
                    break

        while len(labels) < repetition_count:
            labels.append(f"Series {len(labels) + 1}")
        return labels

    @staticmethod
    def _extract_y_value(y_val: Any) -> Any:
        """Backward-compatible alias for value extraction used by older callers/tests."""
        return VegaUtil._literal_value(y_val, 0)

    @staticmethod
    def _convert_line_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to line chart format with multi-series support."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            logger.warning("cant serialize trend if it is not a list")
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        x_key = VegaUtil._pick_x_key(rows, fields, fields.assignments.get("x"))
        if not x_key:
            return {"values": []}

        y_key = fields.assignments.get("y")
        series_keys = [y_key] if y_key else [k for k in fields.numeric_keys if k != x_key]

        if not series_keys:
            logger.warning("No numeric series found in data for line chart")
            return {"values": []}

        values: list[dict[str, Any]] = []
        repetition_count = VegaUtil._detect_repetition_pattern(rows, x_key)

        if repetition_count > 1 and len(series_keys) == 1:
            for idx, item in enumerate(rows):
                y_val = VegaUtil._numeric_value(item.get(series_keys[0]))
                if y_val is not None:
                    values.append({"x": VegaUtil._format_x_value(item.get(x_key), x_key), "y": y_val, "c": idx % repetition_count})
        else:
            for item in rows:
                x_display = VegaUtil._format_x_value(item.get(x_key), x_key)
                for series_idx, series_key in enumerate(series_keys):
                    y_val = VegaUtil._numeric_value(item.get(series_key))
                    if y_val is not None:
                        values.append({"x": x_display, "y": y_val, "c": series_idx})

        label_key = None
        if repetition_count > 1 and len(series_keys) == 1:
            label_key = VegaUtil._series_label_key(rows, x_key, series_keys)
            series_labels = VegaUtil._extract_series_labels(rows, x_key, series_keys, repetition_count)
        elif len(series_keys) > 1:
            series_labels = [VegaUtil._format_column_name(series_key) for series_key in series_keys]
        else:
            series_labels = []

        line_chart = {
            "values": values,
            "_series_labels": series_labels if series_labels else None,
            "_label_key": label_key,
            "_x_key": x_key,
            "_y_keys": series_keys,
        }
        logger.debug(f"converted to line chart: {line_chart}")
        return line_chart

    @staticmethod
    def _convert_scatter_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to scatter chart format."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        x_key = fields.assignments.get("x") or VegaUtil._pick_numeric(fields)
        y_key = fields.assignments.get("y") or VegaUtil._pick_numeric(fields, [x_key] if x_key else [])

        if not (x_key and y_key):
            logger.warning(f"Need at least 2 numeric fields for scatter chart. Found: x={x_key}, y={y_key}")
            return {"values": []}

        category_key = fields.assignments.get("color") or VegaUtil._pick_categorical(fields, [x_key, y_key])
        values = VegaUtil._build_xy_points(rows, x_key, y_key, category_key=category_key)

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_category_key": category_key,
            "_columns": VegaUtil._format_columns(x_key, y_key, category_key),
        }

    @staticmethod
    def _convert_bubble_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to bubble chart format (x, y, size)."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        x_key = fields.assignments.get("x") or VegaUtil._pick_numeric(fields)
        y_key = fields.assignments.get("y") or VegaUtil._pick_numeric(fields, [x_key] if x_key else [])
        size_key = fields.assignments.get("size") or VegaUtil._pick_numeric(fields, [k for k in [x_key, y_key] if k])

        if not (x_key and y_key and size_key):
            logger.warning(f"Need at least 3 numeric fields for bubble chart. Found: x={x_key}, y={y_key}, size={size_key}")
            return {"values": []}

        label_key = fields.assignments.get("color") or VegaUtil._pick_categorical(fields, [x_key, y_key, size_key])
        values = VegaUtil._build_xy_points(
            rows,
            x_key,
            y_key,
            category_key=label_key,
            size_key=size_key,
            category_output_key="label",
        )

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_size_key": size_key,
            "_label_key": label_key,
            "_columns": VegaUtil._format_columns(x_key, y_key, size_key, label_key),
        }

    @staticmethod
    def _convert_treemap(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to treemap format (hierarchical structure)."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        name_key = (
            fields.assignments.get("x")
            or VegaUtil._pick_named_key(fields, {"name", "label", "category", "group", "policyid", "policy", "token"})
            or VegaUtil._pick_categorical(fields)
            or (fields.keys[0] if fields.keys else None)
        )
        size_key = fields.assignments.get("size") or fields.assignments.get("y") or VegaUtil._pick_numeric(fields, [name_key] if name_key else [])
        size_key = size_key or (fields.keys[-1] if fields.keys else None)
        parent_key = VegaUtil._pick_named_key(fields, {"parent", "group", "category"}, [name_key] if name_key else [])

        if not (name_key and size_key):
            return {"values": []}

        values = []
        for item in rows:
            size_val = VegaUtil._numeric_value(item.get(size_key))
            if size_val is None:
                logger.warning("Skipping treemap node: non-numeric size")
                continue

            node: dict[str, Any] = {
                "name": VegaUtil._format_display_value(item.get(name_key, ""), name_key),
                "value": size_val,
            }
            if parent_key:
                node["parent"] = VegaUtil._format_display_value(item.get(parent_key, ""), parent_key)
            values.append(node)

        return {
            "values": values,
            "_name_key": name_key,
            "_size_key": size_key,
            "_parent_key": parent_key,
            "_columns": VegaUtil._format_columns(name_key, size_key, parent_key),
        }

    @staticmethod
    def _convert_heatmap(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to heatmap format (x, y, value)."""
        rows = VegaUtil._as_row_list(data)
        if not rows:
            return {"values": []}

        fields = VegaUtil._prepare_fields(rows, user_query)
        x_key = fields.assignments.get("x") or VegaUtil._pick_categorical(fields)
        y_key = fields.assignments.get("y") or VegaUtil._pick_categorical(fields, [x_key] if x_key else [])
        value_key = fields.assignments.get("z") or fields.assignments.get("size") or VegaUtil._pick_numeric(fields, [k for k in [x_key, y_key] if k])
        value_key = value_key or (fields.keys[-1] if fields.keys else None)

        if not (x_key and y_key and value_key):
            logger.warning(f"Need x, y, and value fields for heatmap. Found: x={x_key}, y={y_key}, value={value_key}")
            return {"values": []}

        x_is_temporal = VegaUtil._is_temporal_key(x_key)
        y_is_temporal = VegaUtil._is_temporal_key(y_key)
        values = []

        for item in rows:
            heat_val = VegaUtil._numeric_value(item.get(value_key))
            if heat_val is None:
                continue

            x_raw = VegaUtil._format_temporal_value(item.get(x_key), include_time=True) if x_is_temporal else str(VegaUtil._literal_value(item.get(x_key), ""))
            y_raw = VegaUtil._format_temporal_value(item.get(y_key), include_time=True) if y_is_temporal else str(VegaUtil._literal_value(item.get(y_key), ""))

            values.append({
                "x": x_raw,
                "y": y_raw,
                "x_raw": x_raw,
                "y_raw": y_raw,
                "value": heat_val,
            })

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_value_key": value_key,
            "_columns": VegaUtil._format_columns(x_key, y_key, value_key),
            "_field_types": {"x": "nominal", "y": "nominal", "value": "quantitative"},
            "_sort_fields": {
                "x": "x_raw" if x_is_temporal else None,
                "y": "y_raw" if y_is_temporal else None,
            },
        }

    @staticmethod
    def _convert_url_to_link(value: str) -> str:
        """Convert URL strings to HTML link format for Vega rendering."""
        value_str = str(value).strip()

        if value_str.startswith('ipfs://'):
            ipfs_id = value_str[7:]
            href = f"https://ipfs.io/ipfs/{ipfs_id}"
            return f'<a href="{href}" target="_blank">{value_str}</a>'
        if value_str.startswith('https://') or value_str.startswith('http://'):
            return f'<a href="{value_str}" target="_blank">{value_str}</a>'
        return value_str

    @staticmethod
    def _format_table_cell(col_name: str, value: Any, sparql_query: str, row: DataRow) -> Any:
        if isinstance(value, dict):
            formatted = get_chain().format_result_value(value)
            if formatted is not None:
                value = formatted
            else:
                value = VegaUtil._literal_value(value, str(value))
        elif isinstance(value, str) and value.endswith(".0"):
            value = value[:-2]

        value = get_chain().convert_entity_to_explorer_link(
            col_name,
            value,
            sparql_query,
            row_context=row,
        )

        if not str(value).startswith('<a href='):
            value = VegaUtil._convert_url_to_link(value)
        return value

    @staticmethod
    def _convert_table(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to table format."""
        table_data = VegaUtil._as_row_list(data)
        if not table_data:
            logger.warning(f"Returning empty table for {user_query} with data {table_data}")
            return {"context": {}, "values": []}

        all_keys = VegaUtil._all_keys(table_data)
        formatted_rows = [
            {
                col_name: VegaUtil._format_table_cell(col_name, row.get(col_name, ""), sparql_query, row)
                for col_name in all_keys
            }
            for row in table_data
        ]

        context, value_columns = VegaUtil._constant_context_and_columns(formatted_rows, all_keys)
        return {"context": context, "values": value_columns}
