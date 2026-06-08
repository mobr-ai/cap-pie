from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class QuerySource(StrEnum):
    ONCHAIN = "onchain"
    ASSET = "asset"
    FEDERATED = "federated"


class FederatedQuery(BaseModel):
    visualization_type: str = ""
    sparql: str = ""
    sql: str = ""
    source: QuerySource
    explanation: str = ""


class FederatedExecutionResult(BaseModel):
    has_data: bool
    sparql_results: dict[str, Any] = Field(default_factory=dict)
    sql_results: list[dict[str, Any]] = Field(default_factory=list)
    error_msg: str = ""
