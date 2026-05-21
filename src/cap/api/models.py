from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class QueryType(StrEnum):
    SELECT = "SELECT"
    ASK = "ASK"
    CONSTRUCT = "CONSTRUCT"
    DESCRIBE = "DESCRIBE"

class QueryRequest(BaseModel):
    query: str
    type: QueryType = QueryType.SELECT

class QueryResponse(BaseModel):
    results: dict

class GraphCreateRequest(BaseModel):
    graph_uri: str
    turtle_data: str = Field(..., description="RDF data in Turtle format")

class GraphUpdateRequest(BaseModel):
    insert_data: str | None = Field(None, description="Triples to insert in Turtle format")
    delete_data: str | None = Field(None, description="Triples to delete in Turtle format")
    prefixes: dict[str, str] | None = Field(None, description="Prefix mappings")

class GraphResponse(BaseModel):
    data: dict[str, Any]

class SuccessResponse(BaseModel):
    success: bool
