import time

from ...config import get_settings
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
{correction}
SQL:
"""

CORRECTION_TEMPLATE = """
IMPORTANT — a previous attempt to answer this question failed.
Previous SQL:
{previous_sql}
Failure reason: {previous_error}
Attempt {attempt} of {max_attempts}. Produce a corrected SELECT that fixes the specific problem above.
"""


async def generate(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        correction = ""
        if state.get("error") and state.get("sql"):
            correction = CORRECTION_TEMPLATE.format(
                previous_sql=state["sql"],
                previous_error=state["error"],
                attempt=state.get("attempt_count", 2),
                max_attempts=get_settings().max_retries,
            )

        prompt = PROMPT.format(
            schema=SCHEMA_DDL,
            question=state["question"],
            correction=correction,
        )
        raw = await chat(prompt)
        state["sql"] = _strip_fences(raw)
        state["error"] = None
    except Exception as exc:
        state["error"] = f"generate failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["generate"] = int(
            (time.perf_counter() - started) * 1000
        )
    return state


def _strip_fences(sql: str) -> str:
    s = sql.strip()
    if s.startswith("```"):
        lines = [ln for ln in s.splitlines() if not ln.strip().startswith("```")]
        s = "\n".join(lines).strip()
    return s
