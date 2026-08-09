import time

from ...guardrails.sql import validate_sql
from ..state import AgentState


async def validate(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        sql = (state.get("sql") or "").strip()
        result = validate_sql(sql)
        if not result.ok:
            state["error"] = f"validation failed: {result.reason}"
    except Exception as exc:
        state["error"] = f"validate failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["validate"] = int(
            (time.perf_counter() - started) * 1000
        )
    return state
