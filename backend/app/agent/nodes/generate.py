import time

from ...llm import chat
from ..prompts import SCHEMA_DDL
from ..state import AgentState

PROMPT = """You are a PostgreSQL SQL generator for a business analytics agent.

{schema}

Task: given the user's question, produce ONE valid SELECT statement that answers it.

Rules:
- SELECT only. Never INSERT/UPDATE/DELETE/DROP.
- Single statement. No semicolons except optionally at the very end.
- Use PostgreSQL 16 dialect.
- Prefer clear, idiomatic SQL. Alias aggregate columns.
- Return ONLY the SQL. No markdown, no comments, no explanation.

Question: {question}

SQL:
"""


async def generate(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        raw = await chat(PROMPT.format(schema=SCHEMA_DDL, question=state["question"]))
        state["sql"] = _strip_fences(raw)
    except Exception as exc:
        state["error"] = f"generate failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["generate"] = int((time.perf_counter() - started) * 1000)
    return state


def _strip_fences(sql: str) -> str:
    s = sql.strip()
    if s.startswith("```"):
        lines = [ln for ln in s.splitlines() if not ln.strip().startswith("```")]
        s = "\n".join(lines).strip()
    return s
