import asyncio
import time

import sqlglot
from sqlalchemy import text
from sqlglot import exp

from ...business_db import engine
from ...config import get_settings
from ..state import AgentState


async def execute(state: AgentState) -> AgentState:
    started = time.perf_counter()
    settings = get_settings()
    sql = (state.get("sql") or "").strip().rstrip(";")

    try:
        async def _run(query: str) -> list[dict]:
            async with engine().connect() as conn:
                result = await conn.execute(text(query))
                return [dict(row) for row in result.mappings().all()]

        timeout_s = settings.query_timeout_ms / 1000

        if _is_aggregation(sql):
            rows = await asyncio.wait_for(_run(sql), timeout=timeout_s)
            state["rows"] = rows
            state["total_row_count"] = len(rows)
            state["overflow"] = False
            state["sql"] = sql
            return state

        count_sql = f"SELECT COUNT(*) AS c FROM ({sql}) t"
        count_rows = await asyncio.wait_for(_run(count_sql), timeout=timeout_s)
        total = int(count_rows[0]["c"])
        state["total_row_count"] = total

        if total > settings.hard_row_ceiling:
            state["error"] = (
                f"execute failed: query would return {total:,} rows, "
                f"exceeding the display limit of {settings.hard_row_ceiling:,}. "
                "Ask a more specific question."
            )
            return state

        if total > settings.safe_inline_limit:
            sample_sql = f"{sql} LIMIT {settings.overflow_sample_size}"
            state["rows"] = await asyncio.wait_for(_run(sample_sql), timeout=timeout_s)
            state["overflow"] = True
            state["sql"] = sql
            return state

        state["rows"] = await asyncio.wait_for(_run(sql), timeout=timeout_s)
        state["overflow"] = False
        state["sql"] = sql
    except asyncio.TimeoutError:
        state["error"] = f"execute failed: query exceeded {settings.query_timeout_ms}ms"
    except Exception as exc:
        state["error"] = f"execute failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["execute"] = int(
            (time.perf_counter() - started) * 1000
        )
    return state


def _is_aggregation(sql: str) -> bool:
    try:
        tree = sqlglot.parse_one(sql, dialect="postgres")
    except Exception:
        return False
    if list(tree.find_all(exp.Group)):
        return True
    if list(tree.find_all(exp.AggFunc)):
        return True
    return False
