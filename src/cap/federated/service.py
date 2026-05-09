import logging

from cap.federated.models import FederatedExecutionResult, FederatedQuery
from cap.federated.sql_service import execute_sql
from cap.services.sparql_service import execute_sparql

logger = logging.getLogger(__name__)


async def execute_federated_query(query: FederatedQuery) -> FederatedExecutionResult:
    sparql_payload = await execute_sparql(
        sparql_query=query.sparql,
        is_sequential=False,
        sparql_queries=[],
    ) if query.sparql else {
        "has_data": False,
        "sparql_results": {},
        "error_msg": "",
    }

    sql_payload = await execute_sql(query.sql) if query.sql else {
        "has_data": False,
        "sql_results": [],
        "error_msg": "",
    }

    errors = [
        msg for msg in [
            sparql_payload.get("error_msg", ""),
            sql_payload.get("error_msg", ""),
        ]
        if msg
    ]

    return FederatedExecutionResult(
        has_data=bool(sparql_payload.get("has_data") or sql_payload.get("has_data")),
        sparql_results=sparql_payload.get("sparql_results", {}),
        sql_results=sql_payload.get("sql_results", []),
        error_msg="; ".join(errors),
    )
