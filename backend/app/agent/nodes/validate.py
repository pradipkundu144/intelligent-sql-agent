import time

from ..state import AgentState


async def validate(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        sql = (state.get("sql") or "").strip().rstrip(";")
        if not sql.upper().startswith("SELECT"):
            state["error"] = "validation failed: only SELECT statements are allowed"
    except Exception as exc:
        state["error"] = f"validate failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["validate"] = int((time.perf_counter() - started) * 1000)
    return state
