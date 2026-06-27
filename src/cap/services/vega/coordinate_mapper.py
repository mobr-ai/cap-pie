import re

from cap.services.vega.value_util import DataRow


class VegaCoordinate:
    @classmethod
    def _parse_coordinate_assignments(cls, user_query: str, data: list[DataRow]) -> dict[str, str]:
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

    @classmethod
    def _match_coordinate_to_field(
        cls,
        coordinate_desc: str,
        data: list[DataRow],
        exclude_keys: list[str] | None = None
        ) -> str | None:

        if not data or not coordinate_desc:
            return None

        exclude_keys = exclude_keys or []
        available_keys = [k for k in cls._all_keys(data) if k not in exclude_keys]

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

    @classmethod
    def _apply_coordinate_mapping(cls, data: list[DataRow], coordinate_map: dict[str, str]) -> dict[str, str]:
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
                field_key = cls._match_coordinate_to_field(
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
                field_key = cls._match_coordinate_to_field(
                    coord_desc,
                    data,
                    exclude_keys=used_keys
                )
                if field_key:
                    field_assignments[coord_name] = field_key
                    used_keys.append(field_key)

        return field_assignments
