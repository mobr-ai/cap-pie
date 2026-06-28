# scripts/test_telegram_chart_renderer_from_sparql.py
from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cap.federated.sparql.sparql_result_processor import convert_sparql_to_kv
from cap.federated.sparql.sparql_service import execute_sparql
from cap.services.vega.facade import VegaConverter


@dataclass(frozen=True)
class QueryBlock:
    nl_query: str
    sparql: str
    visualization_type: str


class FakeDb:
    def add(self, obj: object) -> None:
        _ = obj

    def commit(self) -> None:
        return


class FakeUser:
    user_id = 1


def extract_query_blocks(content: str) -> list[QueryBlock]:
    blocks: list[QueryBlock] = []

    pattern = re.compile(
        r"MESSAGE user\s+(?P<nl_query>.*?)\n"
        r"MESSAGE assistant\s+(?P<assistant_block>.*?)(?=\nMESSAGE user|\Z)",
        re.DOTALL,
    )

    for match in pattern.finditer(content):
        nl_query = match.group("nl_query").strip()
        assistant_block = match.group("assistant_block").strip()

        if not assistant_block:
            continue

        visualization_type = "table"

        if assistant_block.startswith("{"):
            payload = json.loads(assistant_block)
            sparql = str(payload.get("sparql", "")).strip()
            visualization_type = str(
                payload.get("visualization_type") or "table"
            ).strip()
        else:
            sparql = assistant_block.strip()

        if sparql:
            blocks.append(
                QueryBlock(
                    nl_query=nl_query,
                    sparql=sparql,
                    visualization_type=visualization_type,
                )
            )

    return blocks


def count_rows(sparql_results: dict[str, Any]) -> int:
    bindings = sparql_results.get("results", {}).get("bindings", [])
    if bindings:
        return len(bindings)

    if sparql_results.get("boolean") is not None:
        return 1

    return 0


def normalize_render_type(render_type: str) -> str:
    if render_type in VegaConverter.known_types:
        return render_type

    return "table"


async def render_block(
    *,
    block: QueryBlock,
    index: int,
    total: int,
    renderer: Any,
) -> None:
    print(f"\n[{index}/{total}] Executing:")
    print(block.nl_query)

    result = await execute_sparql(
        sparql_query=block.sparql,
        is_sequential=False,
        sparql_queries=[],
    )

    if result.get("error_msg"):
        raise RuntimeError(
            f"SPARQL error for query:\n{block.nl_query}\n\n"
            f"Error: {result['error_msg']}"
        )

    sparql_results = result.get("sparql_results", {})
    row_count = count_rows(sparql_results)
    print(f"Rows returned: {row_count}")

    kv_results = convert_sparql_to_kv(
        sparql_results,
        block.sparql,
    )

    render_type = normalize_render_type(block.visualization_type)

    kv_results["result_type"] = render_type
    kv_results["user_query"] = block.nl_query
    kv_results["sparql_query"] = block.sparql
    kv_results["title"] = block.nl_query[:120]

    rendered = renderer.render_telegram_image(
        db=FakeDb(),
        cap_user=FakeUser(),
        telegram_user_id=1,
        telegram_chat_id=1,
        kv_results=kv_results,
        absolute=False,
    )

    if rendered is None:
        print("Skipped: renderer returned None.")
        return

    print(f"Rendered: {rendered['url']}")
    print(f"Bytes: {rendered['bytes']}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="queries.txt")
    parser.add_argument("--out-dir", default="telegram_render_test_output")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    os.environ["TELEGRAM_RENDER_DIR"] = str(out_dir)
    os.environ["PUBLIC_BASE_URL"] = "http://localhost:8000"
    os.environ["CAP_LOGO_PATH"] = ""

    renderer = importlib.import_module("cap.services.telegram_chart_renderer")

    content = Path(args.input).read_text(encoding="utf-8")
    blocks = extract_query_blocks(content)

    if not blocks:
        raise RuntimeError("No SPARQL query blocks found.")

    for index, block in enumerate(blocks, start=1):
        await render_block(
            block=block,
            index=index,
            total=len(blocks),
            renderer=renderer,
        )

    print(f"\nDone. PNG files written to: {out_dir}")


if __name__ == "__main__":
    asyncio.run(main())
