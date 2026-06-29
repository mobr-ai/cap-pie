import asyncio
from pathlib import Path

from cap.federated.sql.sql_service import execute_sql
from cap.util.query_file_parser import QueryFileParser

INPUT_FILE = Path("queries.txt")

def extract_query_blocks(content: str) -> list[dict]:
    queries = []
    raw_queries = QueryFileParser.parse(content)
    for nl_query, payload in raw_queries:
        sql = str(payload.get("sql", "")).strip()
        if sql:
            queries.append({
                "nl_query": nl_query,
                "sql": sql,
            })

    return queries


def count_rows(sql_results) -> int:
    if sql_results is None:
        return 0

    if isinstance(sql_results, dict):
        if "rows" in sql_results:
            return len(sql_results["rows"])
        if "data" in sql_results:
            return len(sql_results["data"])

    if isinstance(sql_results, (list, tuple)):
        return len(sql_results)

    return 1


async def main():
    content = INPUT_FILE.read_text(encoding="utf-8")
    query_blocks = extract_query_blocks(content)

    if not query_blocks:
        raise RuntimeError("No SQL queries found in input file.")

    for idx, item in enumerate(query_blocks, start=1):
        nl_query = item["nl_query"]
        sql = item["sql"]

        print(f"\n[{idx}/{len(query_blocks)}] Executing NL query:")
        print(nl_query)

        result = await execute_sql(sql=sql)

        if result.get("error_msg"):
            raise RuntimeError(
                f"SQL error while executing query:\n{nl_query}\n\n"
                f"Error: {result['error_msg']}"
            )

        sql_results = result.get("sql_results", {})
        row_count = count_rows(sql_results)

        print(f"Rows returned: {row_count}")

    print("\nAll SQL queries executed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
