import logging
from typing import Any

from sqlalchemy import text

from cap.database.session import SessionLocal
from cap.federated.sql_util import force_limit

logger = logging.getLogger(__name__)


async def execute_sql(sql: str, limit_cap: int = 3500) -> dict[str, Any]:
    if not sql or not sql.strip():
        return {"has_data": False, "sql_results": [], "error_msg": ""}

    safe_sql = force_limit(sql, limit_cap)

    try:
        with SessionLocal() as db:
            result = db.execute(text(safe_sql))
            rows = [dict(row._mapping) for row in result.fetchall()]

        return {
            "has_data": bool(rows),
            "sql_results": rows,
            "error_msg": "",
        }

    except Exception as exc:
        logger.exception("SQL execution failed")
        return {
            "has_data": False,
            "sql_results": [],
            "error_msg": str(exc),
        }
