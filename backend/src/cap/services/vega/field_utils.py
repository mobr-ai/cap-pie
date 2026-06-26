import logging
from typing import Any

from cap.services.vega.value_util import DataRow

logger = logging.getLogger(__name__)

class VegaField:
    @classmethod
    def _all_keys(cls, data: list[DataRow]) -> list[str]:
        keys: list[str] = []

        for item in data:
            if not isinstance(item, dict):
                continue

            for key in item.keys():
                if key not in keys:
                    keys.append(key)

        return keys

    @classmethod
    def _first_value_for_key(cls, data: list[DataRow], key: str) -> Any:
        for item in data:
            if not isinstance(item, dict):
                continue

            value = item.get(key)

            if value is not None:
                return value

        return None

    @classmethod
    def _is_numeric_field(cls, data: list[DataRow], key: str) -> bool:
        return any(
            cls._is_numeric_value(item.get(key))
            for item in data
            if isinstance(item, dict) and item.get(key) is not None
        )

    @classmethod
    def _classify_fields(cls, data: list[DataRow]) -> tuple[list[str], list[str]]:
        if not data:
            return [], []

        categorical_keys = []
        numeric_keys = []

        for key in cls._all_keys(data):
            if cls._is_numeric_field(data, key):
                numeric_keys.append(key)
            else:
                categorical_keys.append(key)

        return categorical_keys, numeric_keys

    @classmethod
    def _get_x_candidates(cls, first_item: DataRow, keys: list[str]) -> list[str]:
        x_candidates = cls.x_candidates.copy()
        candidate_names = {c.lower() for c in x_candidates}

        for k in keys:
            val = first_item.get(k)

            if cls._is_date_value(val) and k.lower() not in candidate_names:
                x_candidates.append(k)
                candidate_names.add(k.lower())

        return x_candidates

    @classmethod
    def _is_date_field(cls, data: list[DataRow], key: str) -> bool:
        return any(
            cls._is_date_value(item.get(key))
            for item in data
            if isinstance(item, dict) and item.get(key) is not None
        )
