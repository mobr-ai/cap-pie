from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class QuerySource(str, Enum):
    ONCHAIN = "onchain"
    ASSET = "asset"
    FEDERATED = "federated"


class FederatedQuery(BaseModel):
    sparql: str = ""
    sql: str = ""
    source: QuerySource
    explanation: str = ""


class FederatedExecutionResult(BaseModel):
    has_data: bool
    sparql_results: dict[str, Any] = Field(default_factory=dict)
    sql_results: list[dict[str, Any]] = Field(default_factory=list)
    error_msg: str = ""