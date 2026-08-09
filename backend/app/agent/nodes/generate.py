import logging
import time

from ...config import get_settings
from ...llm import chat
from ...rag.retrieve import RetrievedContext, get_context
from ..prompts import SCHEMA_DDL
from ..state import AgentState

logger = logging.getLogger(__name__)

PROMPT = """You are a PostgreSQL SQL generator for a business analytics agent.

{schema}
{column_notes}{few_shot_examples}
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
        try:
            context = await get_context(state["question"])
        except Exception as exc:
            logger.warning("rag.retrieve failed, continuing without context: %s", exc)
            context = RetrievedContext()

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
            column_notes=_format_column_notes(context),
            few_shot_examples=_format_few_shots(context),
            question=state["question"],
            correction=correction,
        )
        usage_sink = state.setdefault("stage_tokens", {}).setdefault("generate", {})
        raw = await chat(
            prompt,
            trace_id=state.get("trace_id"),
            span_name="generate",
            usage_sink=usage_sink,
        )
        state["sql"] = _strip_fences(raw)
        state["error"] = None
    except Exception as exc:
        state["error"] = f"generate failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["generate"] = int(
            (time.perf_counter() - started) * 1000
        )
    return state


def _format_column_notes(context: RetrievedContext) -> str:
    if not context.column_docs:
        return ""
    lines = [
        f"- {table}.{column}: {description}"
        for table, column, description in context.column_docs
    ]
    return "\nRelevant column notes:\n" + "\n".join(lines) + "\n"


def _format_few_shots(context: RetrievedContext) -> str:
    if not context.few_shots:
        return ""
    blocks = [
        f"Q: {question}\nSQL: {sql}"
        for question, sql in context.few_shots
    ]
    return "\nSimilar past questions and their SQL:\n" + "\n\n".join(blocks) + "\n"


def _strip_fences(sql: str) -> str:
    s = sql.strip()
    if s.startswith("```"):
        lines = [ln for ln in s.splitlines() if not ln.strip().startswith("```")]
        s = "\n".join(lines).strip()
    return s
