import logging
import re
from datetime import datetime
from collections import Counter
from typing import Any, TypeAlias

from opentelemetry import trace

from cap.chains.registry import get_chain

DataRow: TypeAlias = dict[str, Any]
VegaValue: TypeAlias = dict[str, Any]

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

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

        data = VegaUtil._preprocess_date_values(data)

        try:
            if result_type == "bar_chart":
                return VegaUtil._convert_bar_chart(data, user_query, sparql_query)

            elif result_type == "pie_chart":
                return VegaUtil._convert_pie_chart(data, user_query, sparql_query)

            elif result_type == "line_chart":
                return VegaUtil._convert_line_chart(data, user_query, sparql_query)

            elif result_type == "table":
                return VegaUtil._convert_table(data, user_query, sparql_query)

            elif result_type == "scatter_chart":
                return VegaUtil._convert_scatter_chart(data, user_query, sparql_query)

            elif result_type == "bubble_chart":
                return VegaUtil._convert_bubble_chart(data, user_query, sparql_query)

            elif result_type == "treemap":
                return VegaUtil._convert_treemap(data, user_query, sparql_query)

            elif result_type == "heatmap":
                return VegaUtil._convert_heatmap(data, user_query, sparql_query)
            else:
                return {"values": []}

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
            if len(clean_val) <= 2:
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
        candidate_names = {c.lower() for c in x_candidates}

        for k in keys:
            val = first_item.get(k)

            if VegaUtil._is_date_value(val) and k.lower() not in candidate_names:
                x_candidates.append(k)
                candidate_names.add(k.lower())

        return x_candidates

    @staticmethod
    def _parse_coordinate_assignments(user_query: str, data: list[DataRow]) -> dict[str, str]:
        """
        Parse user query to extract explicit coordinate assignments (x, y, z, size, color, etc.).
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
        """Convert camelCase and snake_case variable names to human-readable format."""
        import re

        if not column_name:
            return column_name

        formatted = column_name.replace("_", " ")
        formatted = re.sub(r'(?<!^)([A-Z])', r' \1', formatted)
        words = formatted.split()

        return " ".join(word.capitalize() for word in words)

    @staticmethod
    def _convert_bar_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to bar chart format."""
        if isinstance(data, list) and len(data) > 0:
            first_item = data[0]
            keys = VegaUtil._all_keys(data)

            # Parse coordinate assignments from user query
            coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
            field_assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)

            # Determine category (x-axis) and value (y-axis) keys
            # Priority: user-specified coordinates > heuristic detection
            category_key = field_assignments.get('x')
            value_key = field_assignments.get('y')

            # Fallback to heuristic if not specified
            if not category_key:
                category_candidates = VegaUtil._get_x_candidates(first_item, keys)
                category_key = next((k for k in keys if k.lower() in [c.lower() for c in category_candidates]), keys[0])

            # Value field is typically numeric - find first numeric field that's not the category
            if not value_key:
                for k in keys:
                    if k != category_key and VegaUtil._is_numeric_field(data, k):
                        value_key = k
                        break

            if not value_key:
                value_key = keys[-1] if len(keys) > 1 else keys[0]

            values = []
            for item in data:
                cat_val = item.get(category_key, "")
                if isinstance(cat_val, dict):
                    cat_val = cat_val.get('value', str(cat_val))

                amt_val = item.get(value_key, 0)
                if isinstance(amt_val, dict):
                    continue

                try:
                    values.append({
                        "category": VegaUtil._format_display_value(cat_val, category_key),
                        "amount": float(amt_val)
                    })
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping bar chart entry: {e}")
                    continue

            return {"values": values}

        return {"values": []}

    @staticmethod
    def _convert_pie_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to pie chart format."""
        # Pie chart data can be either a list or a nested dict
        if isinstance(data, dict):
            # Handle nested structure like the top holders example
            # Extract meaningful category-value pairs
            values = []

            # Try to find percentage/ratio fields
            for key, value in data.items():
                if isinstance(value, (int, float, str)):
                    try:
                        numeric_val = float(value)
                        # Convert ratios to percentages if needed
                        if 0 <= numeric_val <= 1:
                            numeric_val *= 100
                        values.append({
                            "category": key,
                            "value": numeric_val
                        })
                    except Exception as e:
                        logger.warning(f"Failed to convert value for key {key}: {e}")
                        continue

            # If we have meaningful data, return it; otherwise create a simple representation
            if values:
                return {"values": values}

        elif isinstance(data, list) and len(data) > 0:
            keys = VegaUtil._all_keys(data)

            # Find category and value keys
            category_key = next((k for k in keys if k.lower() in ['category', 'label', 'name', 'group']), keys[0])
            value_key = next((k for k in keys if k != category_key), keys[-1])

            values = []
            for item in data:
                cat_val = item.get(category_key, "")
                val = item.get(value_key, 0)
                if isinstance(val, dict):
                    continue

                try:
                    values.append({
                        "category": VegaUtil._format_display_value(cat_val, category_key),
                        "value": float(val)
                    })
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping pie chart entry: {e}")
                    continue

            return {"values": values}

        return {"values": []}

    @staticmethod
    def _detect_repetition_pattern(data: list[DataRow], x_key: str) -> int:
        """Detect if x values repeat consistently, indicating multiple series in one variable."""
        if len(data) < 2:
            return 1

        x_values = [
            str(VegaUtil._format_x_value(item.get(x_key), x_key))
            for item in data
        ]
        x_counts = Counter(x_values)
        unique_counts = set(x_counts.values())

        # Consistent repetition pattern exists if all x values repeat the same number of times
        if len(unique_counts) == 1 and list(unique_counts)[0] > 1:
            return list(unique_counts)[0]

        return 1

    @staticmethod
    def _extract_raw_value(value: Any) -> Any:
        """Extract the underlying scalar value without applying visualization formatting."""
        if isinstance(value, dict):
            if "value" in value:
                return value["value"]
            return str(value)

        return value

    @staticmethod
    def _parse_date_value(value: Any) -> datetime | None:
        """Return a datetime only when the actual value has a recognized date format."""
        raw_value = VegaUtil._extract_raw_value(value)

        if isinstance(raw_value, datetime):
            return raw_value

        if not isinstance(raw_value, str):
            return None

        clean_value = raw_value.strip()
        if not clean_value:
            return None

        # Keep this strict to avoid treating ordinary labels, numeric values,
        # hashes, ratios, or ranges as dates.
        date_patterns = (
            r"^\d{4}-\d{2}$",
            r"^\d{4}-\d{2}-\d{2}$",
            r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$",
        )

        if not any(re.match(pattern, clean_value) for pattern in date_patterns):
            return None

        if re.match(r"^\d{4}-\d{2}$", clean_value):
            clean_value = f"{clean_value}-01"

        try:
            normalized = clean_value.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None

    @staticmethod
    def _is_date_value(value: Any) -> bool:
        """Determine date-ness from the value itself, not from the variable name."""
        return VegaUtil._parse_date_value(value) is not None

    @staticmethod
    def _is_date_field(data: list[DataRow], key: str) -> bool:
        return any(
            VegaUtil._is_date_value(item.get(key))
            for item in data
            if isinstance(item, dict) and item.get(key) is not None
        )

    @staticmethod
    def _normalize_date_value(value: Any) -> Any:
        dt = VegaUtil._parse_date_value(value)
        if dt is None:
            return value
        return dt.isoformat()

    @staticmethod
    def _preprocess_date_values(data: Any) -> Any:
        """Normalize date-formatted values."""
        if isinstance(data, list):
            return [VegaUtil._preprocess_date_values(item) for item in data]

        if isinstance(data, dict):
            processed: dict[str, Any] = {}

            for key, value in data.items():
                if isinstance(value, dict):
                    nested = dict(value)
                    if "value" in nested:
                        nested["value"] = VegaUtil._normalize_date_value(nested["value"])
                    processed[key] = nested
                else:
                    processed[key] = VegaUtil._normalize_date_value(value)

            return processed

        return VegaUtil._normalize_date_value(data)

    @staticmethod
    def _format_display_value(value: Any, key: str | None = None) -> str:
        """Format values used as visual labels across all chart types."""
        value = VegaUtil._extract_raw_value(value)

        if value is None:
            return ""

        return str(value)

    @staticmethod
    def _format_x_value(x_val: Any, x_key: str) -> str:
        """Extract and format x-axis value for charts."""
        x_val = VegaUtil._extract_raw_value(x_val)

        if isinstance(x_val, str) and "epoch" in x_key.lower():
            try:
                epoch_num = int(float(x_val))
                return get_chain().format_axis_value(x_key, epoch_num)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to convert epoch {x_val}: {e}")
                return str(x_val)

        if "epoch" in x_key.lower():
            try:
                epoch_num = int(float(x_val))
                return get_chain().format_axis_value(x_key, epoch_num)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to convert epoch {x_val}: {e}")
                return str(x_val)

        return VegaUtil._format_display_value(x_val)

    @staticmethod
    def _abbreviate_label(label: str, max_length: int = 11) -> str:
        """Abbreviate labels longer than max_length using ellipsis format."""
        if len(label) <= max_length:
            return label
        # Keep first 7 and last 4 characters for identifiable abbreviation
        prefix_len = min(7, max_length - 7)
        suffix_len = 4
        return f"{label[:prefix_len]}...{label[-suffix_len:]}"

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

        # Find columns that could contain series identifiers
        # (not x-axis, not y-axis/series values)
        candidate_keys = [
            k for k in VegaUtil._all_keys(data)
            if k != x_key and k not in series_keys
        ]

        if not candidate_keys:
            return [f"Series {i+1}" for i in range(repetition_count)]

        # Use the first candidate column for labels
        label_key = candidate_keys[0]
        labels = []

        # Extract unique values in the order they appear (one per series)
        seen = set()
        for item in data:
            label_val = item.get(label_key, "")
            if isinstance(label_val, dict):
                label_val = label_val.get('value', str(label_val))
            label_str = str(label_val)

            if label_str not in seen:
                seen.add(label_str)
                labels.append(VegaUtil._abbreviate_label(label_str))

                if len(labels) == repetition_count:
                    break

        # Fill in any missing labels
        while len(labels) < repetition_count:
            labels.append(f"Series {len(labels)+1}")

        return labels

    @staticmethod
    def _extract_y_value(y_val: Any) -> Any:
        """Extract numeric value from potentially nested structures."""
        if isinstance(y_val, dict):
            return next(iter(y_val.values()), 0)
        return y_val

    @staticmethod
    def _convert_line_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to line chart format with multi-series support."""
        if not isinstance(data, list) or len(data) == 0:
            logger.warning("cant serialize trend if it is not a list")
            return {"values": []}

        first_item = data[0]
        keys = VegaUtil._all_keys(data)

        # Parse coordinate assignments from user query
        coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
        field_assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)

        # Determine x-axis field (typically time-based or sequential)
        # Priority: user-specified coordinates > heuristic detection
        x_key = field_assignments.get('x')

        if not x_key:
            x_candidates = VegaUtil._get_x_candidates(first_item, keys)
            x_key = next((k for k in keys if k.lower() in [c.lower() for c in x_candidates]), keys[0])

        # All other numeric fields are series (or user-specified y)
        series_keys = []
        y_key = field_assignments.get('y')

        if y_key:
            # User specified y coordinate, use that as the primary series
            series_keys = [y_key]
        else:
            # Auto-detect: all numeric fields except x_key
            for k in keys:
                if k != x_key and VegaUtil._is_numeric_field(data, k):
                    series_keys.append(k)

        # If no series keys found, skip this conversion
        if not series_keys:
            logger.warning("No numeric series found in data for line chart")
            return {"values": []}

        # Build line chart data with series index
        values = []
        repetition_count = VegaUtil._detect_repetition_pattern(data, x_key)

        if repetition_count > 1 and len(series_keys) == 1:
            # Single variable contains multiple series via repetition
            for idx, item in enumerate(data):
                series_idx = idx % repetition_count
                x_display = VegaUtil._format_x_value(item.get(x_key), x_key)
                y_val = VegaUtil._extract_y_value(item.get(series_keys[0]))

                if y_val is not None:
                    try:
                        values.append({"x": x_display, "y": y_val, "c": series_idx})
                    except Exception as e:
                        logger.warning(f"Failed to build series {series_idx}: {e}")
        else:
            # Multiple variables each represent a series
            for item in data:
                x_display = VegaUtil._format_x_value(item.get(x_key), x_key)

                for series_idx, series_key in enumerate(series_keys):
                    y_val = VegaUtil._extract_y_value(item.get(series_key))

                    if y_val is not None:
                        try:
                            values.append({"x": x_display, "y": y_val, "c": series_idx})
                        except Exception as e:
                            logger.warning(f"Failed to build series {series_idx}: {e}")

        # Extract series labels if multiple series detected
        series_labels = []
        label_key = None

        if repetition_count > 1 and len(series_keys) == 1:
            candidate_keys = [
                k for k in VegaUtil._all_keys(data)
                if k != x_key and k not in series_keys
            ]
            if candidate_keys:
                label_key = candidate_keys[0]

            series_labels = VegaUtil._extract_series_labels(
                data, x_key, series_keys, repetition_count
            )

        elif len(series_keys) > 1:
            series_labels = [
                VegaUtil._format_column_name(series_key)
                for series_key in series_keys
            ]

        line_chart = {
            "values": values,
            "_series_labels": series_labels if series_labels else None,
            "_label_key": label_key,  # Which column was used for series labels
            "_x_key": x_key,  # X-axis column
            "_y_keys": series_keys  # Y-axis column(s)
        }
        logger.debug(f"converted to line chart: {line_chart}")
        return line_chart

    @staticmethod
    def _convert_scatter_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to scatter chart format."""
        if not isinstance(data, list) or len(data) == 0:
            return {"values": []}

        keys = VegaUtil._all_keys(data)

        # Parse coordinate assignments from user query
        coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
        field_assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)

        # Determine x and y keys
        # Priority: user-specified coordinates > heuristic detection
        x_key = field_assignments.get('x')
        y_key = field_assignments.get('y')

        # Find numeric fields for fallback
        numeric_keys = [k for k in keys if VegaUtil._is_numeric_field(data, k)]

        # Fallback to heuristic if coordinates not specified
        used_keys = [k for k in [x_key, y_key] if k is not None]
        available_numeric = [k for k in numeric_keys if k not in used_keys]

        if not x_key and available_numeric:
            x_key = available_numeric[0]
            available_numeric = available_numeric[1:]

        if not y_key and available_numeric:
            y_key = available_numeric[0]

        if not (x_key and y_key):
            logger.warning(f"Need at least 2 numeric fields for scatter chart. Found: x={x_key}, y={y_key}")
            return {"values": []}

        # Optional: find category field for coloring (from query or heuristic)
        category_key = field_assignments.get('color')
        if not category_key:
            # Heuristic: first non-numeric, non-coordinate field
            for k in keys:
                if k not in [x_key, y_key] and not VegaUtil._is_numeric_field(data, k):
                    category_key = k
                    break

        values = []
        for item in data:
            x_val = VegaUtil._extract_y_value(item.get(x_key))
            y_val = VegaUtil._extract_y_value(item.get(y_key))

            if x_val is not None and y_val is not None:
                try:
                    point: dict[str, Any] = {"x": float(x_val), "y": float(y_val)}
                    if category_key:
                        cat_val = item.get(category_key, "")
                        if isinstance(cat_val, dict):
                            cat_val = cat_val.get('value', str(cat_val))

                        point["category"] = VegaUtil._format_display_value(cat_val, category_key)
                    values.append(point)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping scatter point: {e}")
                    continue

        # Format column names for metadata
        formatted_columns = [
            VegaUtil._format_column_name(x_key),
            VegaUtil._format_column_name(y_key)
        ]
        if category_key:
            formatted_columns.append(VegaUtil._format_column_name(category_key))

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_category_key": category_key,
            "_columns": formatted_columns
        }

    @staticmethod
    def _convert_bubble_chart(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to bubble chart format (x, y, size)."""
        if not isinstance(data, list) or len(data) == 0:
            return {"values": []}

        keys = VegaUtil._all_keys(data)

        # Parse coordinate assignments from user query
        coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
        field_assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)

        # Determine x, y, and size keys
        # Priority: user-specified coordinates > heuristic detection
        x_key = field_assignments.get('x')
        y_key = field_assignments.get('y')
        size_key = field_assignments.get('size')

        # Find numeric fields for fallback
        numeric_keys = [k for k in keys if VegaUtil._is_numeric_field(data, k)]

        # Filter out already assigned keys from numeric_keys for fallback selection
        used_keys = [k for k in [x_key, y_key, size_key] if k is not None]
        available_numeric = [k for k in numeric_keys if k not in used_keys]

        # Fallback to heuristic if coordinates not specified
        if not x_key and available_numeric:
            x_key = available_numeric[0]
            available_numeric = available_numeric[1:]

        if not y_key and available_numeric:
            y_key = available_numeric[0]
            available_numeric = available_numeric[1:]

        if not size_key and available_numeric:
            size_key = available_numeric[0]
            available_numeric = available_numeric[1:]

        # Validate we have at least 3 numeric fields
        if not (x_key and y_key and size_key):
            logger.warning(f"Need at least 3 numeric fields for bubble chart. Found: x={x_key}, y={y_key}, size={size_key}")
            return {"values": []}

        # Optional: find category/label field (from query or heuristic)
        label_key = field_assignments.get('color')  # Color can be used as label
        if not label_key:
            # Heuristic: first non-numeric field
            for k in keys:
                if k not in [x_key, y_key, size_key] and not VegaUtil._is_numeric_field(data, k):
                    label_key = k
                    break

        values = []
        for item in data:
            x_val = VegaUtil._extract_y_value(item.get(x_key))
            y_val = VegaUtil._extract_y_value(item.get(y_key))
            size_val = VegaUtil._extract_y_value(item.get(size_key))

            if x_val is not None and y_val is not None and size_val is not None:
                try:
                    bubble: dict[str, Any] = {
                        "x": float(x_val),
                        "y": float(y_val),
                        "size": float(size_val)
                    }
                    if label_key:
                        label_val = item.get(label_key, "")
                        if isinstance(label_val, dict):
                            label_val = label_val.get('value', str(label_val))

                        bubble["label"] = VegaUtil._format_display_value(label_val, label_key)
                    values.append(bubble)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping bubble: {e}")
                    continue

        # Format column names for metadata
        formatted_columns = [
            VegaUtil._format_column_name(x_key),
            VegaUtil._format_column_name(y_key),
            VegaUtil._format_column_name(size_key)
        ]
        if label_key:
            formatted_columns.append(VegaUtil._format_column_name(label_key))

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_size_key": size_key,
            "_label_key": label_key,
            "_columns": formatted_columns
        }

    @staticmethod
    def _convert_treemap(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to treemap format (hierarchical structure)."""
        if not isinstance(data, list) or len(data) == 0:
            return {"values": []}

        keys = VegaUtil._all_keys(data)

        # Find name/label and size fields
        name_key = next((k for k in keys if k.lower() in ['name', 'label', 'category', 'group', 'policyid', 'policy', 'token']), keys[0])

        # Find numeric field for size - use centralized numeric detection
        size_key = None
        for k in keys:
            if k != name_key and VegaUtil._is_numeric_field(data, k):
                size_key = k
                break

        if not size_key:
            size_key = keys[-1] if len(keys) > 1 else keys[0]

        # Optional: find parent/group field for hierarchy
        parent_key = next((k for k in keys if k.lower() in ['parent', 'group', 'category'] and k != name_key), None)

        values = []
        for item in data:
            name_val = item.get(name_key, "")
            if isinstance(name_val, dict):
                name_val = name_val.get('value', str(name_val))

            size_val = VegaUtil._extract_y_value(item.get(size_key))

            if size_val is not None:
                try:
                    node = {
                        "name": VegaUtil._format_display_value(name_val, name_key),
                        "value": float(size_val)
                    }
                    if parent_key:
                        parent_val = item.get(parent_key, "")
                        if isinstance(parent_val, dict):
                            parent_val = parent_val.get('value', str(parent_val))
                        node["parent"] = str(parent_val)
                    values.append(node)
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping treemap node: {e}")
                    continue

        # Format column names for metadata
        formatted_columns = [
            VegaUtil._format_column_name(name_key),
            VegaUtil._format_column_name(size_key)
        ]
        if parent_key:
            formatted_columns.append(VegaUtil._format_column_name(parent_key))

        return {
            "values": values,
            "_name_key": name_key,
            "_size_key": size_key,
            "_parent_key": parent_key,
            "_columns": formatted_columns
        }

    @staticmethod
    def _convert_heatmap(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to heatmap format (x, y, value)."""
        if not isinstance(data, list) or len(data) == 0:
            return {"values": []}

        keys = VegaUtil._all_keys(data)

        coordinate_map = VegaUtil._parse_coordinate_assignments(user_query, data)
        field_assignments = VegaUtil._apply_coordinate_mapping(data, coordinate_map)

        x_key = field_assignments.get("x")
        y_key = field_assignments.get("y")
        value_key = field_assignments.get("z")

        categorical_keys, numeric_keys = VegaUtil._classify_fields(data)

        used_keys = [k for k in [x_key, y_key, value_key] if k is not None]
        available_categorical = [k for k in categorical_keys if k not in used_keys]
        available_numeric = [k for k in numeric_keys if k not in used_keys]

        if not x_key and available_categorical:
            x_key = available_categorical[0]
            available_categorical = available_categorical[1:]

        if not y_key and available_categorical:
            y_key = available_categorical[0]

        if not value_key and available_numeric:
            value_key = available_numeric[0]
        elif not value_key and keys:
            value_key = keys[-1]

        if not (x_key and y_key and value_key):
            logger.warning(
                f"Need x, y, and value fields for heatmap. Found: x={x_key}, y={y_key}, value={value_key}"
            )
            return {"values": []}

        x_is_temporal = VegaUtil._is_date_field(data, x_key)
        y_is_temporal = VegaUtil._is_date_field(data, y_key)

        values = []

        for item in data:
            x_val = item.get(x_key, "")
            if isinstance(x_val, dict):
                x_val = x_val.get("value", str(x_val))

            y_val = item.get(y_key, "")
            if isinstance(y_val, dict):
                y_val = y_val.get("value", str(y_val))

            heat_val = VegaUtil._extract_y_value(item.get(value_key))

            if heat_val is None:
                continue

            try:
                x_raw = str(x_val)
                y_raw = str(y_val)

                x_dt = VegaUtil._parse_date_value(x_raw) if x_is_temporal else None
                y_dt = VegaUtil._parse_date_value(y_raw) if y_is_temporal else None

                x_label = x_dt.strftime("%d %b %Hh") if x_dt else x_raw
                y_label = y_dt.strftime("%d %b %Hh") if y_dt else y_raw

                values.append({
                    "x": x_label,
                    "y": y_label,
                    "x_raw": x_raw,
                    "y_raw": y_raw,
                    "value": float(heat_val),
                })

            except (ValueError, TypeError) as e:
                logger.warning(f"Skipping heatmap cell: {e}")
                continue

        formatted_columns = [
            VegaUtil._format_column_name(x_key),
            VegaUtil._format_column_name(y_key),
            VegaUtil._format_column_name(value_key),
        ]

        return {
            "values": values,
            "_x_key": x_key,
            "_y_key": y_key,
            "_value_key": value_key,
            "_columns": formatted_columns,
            "_field_types": {
                "x": "nominal",
                "y": "nominal",
                "value": "quantitative",
            },
            "_sort_fields": {
                "x": "x_raw" if x_is_temporal else None,
                "y": "y_raw" if y_is_temporal else None,
            },
        }

    @staticmethod
    def _convert_url_to_link(value: str) -> str:
        """Convert URL strings to HTML link format for Vega rendering."""
        value_str = str(value).strip()

        # Check if it's an IPFS URL
        if value_str.startswith('ipfs://'):
            ipfs_id = value_str[7:]  # Remove 'ipfs://' prefix
            href = f"https://ipfs.io/ipfs/{ipfs_id}"
            return f'<a href="{href}" target="_blank">{value_str}</a>'

        # Check if it's already an HTTPS URL
        elif value_str.startswith('https://') or value_str.startswith('http://'):
            return f'<a href="{value_str}" target="_blank">{value_str}</a>'

        # Not a URL, return as-is
        return value_str

    @staticmethod
    def _convert_table(data: Any, user_query: str, sparql_query: str) -> dict[str, Any]:
        """Convert data to table format."""

        # Forcing list for one count results
        table_data = data
        if isinstance(data, dict):
            table_data = [data]

        if not isinstance(table_data, list) or len(table_data) == 0:
            logger.warning(f"Returning empty table for {user_query} with data {table_data}")
            return {"context": {}, "values": []}

        all_keys = VegaUtil._all_keys(table_data)
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

                elif isinstance(value, str):
                    if value.endswith(".0"):
                        value = value[:-2]

                value = get_chain().convert_entity_to_explorer_link(
                    col_name,
                    value,
                    sparql_query,
                    row_context=row,
                )

                if not str(value).startswith('<a href='):
                    value = VegaUtil._convert_url_to_link(value)

                formatted_row[col_name] = value

            formatted_rows.append(formatted_row)

        context: dict[str, Any] = {}
        value_columns: list[dict[str, Any]] = []

        visible_col_idx = 1
        for col_name in all_keys:
            col_values = [row[col_name] for row in formatted_rows]
            unique_values = set(map(str, col_values))

            if len(unique_values) == 1:
                context[col_name] = col_values[0]
                continue

            value_columns.append({
                f"col{visible_col_idx}": col_name,
                "values": col_values,
            })

            visible_col_idx += 1

        return {
            "context": context,
            "values": value_columns,
        }
