import time

from ...llm import chat
from ..state import AgentState

REFUSAL_OUT_OF_SCOPE = (
    "I can only answer questions about the customer, product, and order data. "
    "Try asking about revenue, orders, customers, or products."
)

REFUSAL_DESTRUCTIVE = (
    "That request was blocked because I can only read data, not modify it. "
    "Try asking a question about the customer, product, or order data instead."
)

PROMPT = """You are a business analyst explaining the result of a SQL query to a user
who does not read SQL. Speak plainly, one or two sentences, no jargon, no SQL, no code.
If the rows are empty, say so honestly rather than inventing an answer.

Question: {question}
Rows returned ({row_count} total): {rows}

Plain-English answer:
"""

PROMPT_OVERFLOW = """You are a business analyst explaining the result of a SQL query to a user
who does not read SQL. Speak plainly, no jargon, no SQL, no code.

The query returned {total_row_count} rows in total — too many to display inline. You are
being shown only a sample of the first {sample_size} rows below. In your answer, you MUST:
1. State the true total row count explicitly (e.g. "There are {total_row_count} customers in total...").
2. Base your summary on the sample as representative, not as the complete set.
3. Mention that the full result is available via the "View full results" option.

Question: {question}
Total row count: {total_row_count}
Sample rows (first {sample_size} of {total_row_count}): {rows}

Plain-English answer:
"""


async def explain(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        if state.get("error"):
            state["answer"] = _friendly_error(state["error"])
        elif state.get("intent_type") == "destructive":
            state["answer"] = REFUSAL_DESTRUCTIVE
        elif state.get("intent_type") == "out_of_scope" or state.get("in_scope") is False:
            state["answer"] = REFUSAL_OUT_OF_SCOPE
        else:
            rows = state.get("rows") or []
            total = state.get("total_row_count", len(rows))
            is_overflow = state.get("overflow") is True

            if is_overflow:
                prompt = PROMPT_OVERFLOW.format(
                    question=state["question"],
                    rows=rows,
                    total_row_count=total,
                    sample_size=len(rows),
                )
            else:
                prompt = PROMPT.format(
                    question=state["question"],
                    row_count=total,
                    rows=rows,
                )
            state["answer"] = await chat(prompt, model="gpt-4o-mini")
    except Exception as exc:
        state["answer"] = f"I couldn't finish that answer — {exc}"
    finally:
        state.setdefault("stage_timings", {})["explain"] = int((time.perf_counter() - started) * 1000)
    return state


def _friendly_error(err: str) -> str:
    if "only SELECT" in err:
        return "That request was blocked because I can only read data, not modify it."
    if "timeout" in err.lower():
        return "That query took too long to run. Try a narrower question."
    return "I couldn't build a valid query for that — could you rephrase it?"
