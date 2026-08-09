import time

from ...llm import chat
from ..state import AgentState

REFUSAL_OUT_OF_SCOPE = (
    "That request is outside what I can answer. {reason}"
    "I can only answer questions about the customer, product, and order data — "
    "try asking about revenue, orders, customers, or products."
)

REFUSAL_DESTRUCTIVE = (
    "That request was blocked. {reason}"
    "I can only read data, not modify it. "
    "Try asking a question about the customer, product, or order data instead."
)

REFUSAL_SYSTEM_ACCESS = (
    "That request was blocked. {reason}"
    "I can only access the customer, product, and order data — "
    "not internal database or system tables."
)

REFUSAL_DATA_UNAVAILABLE = (
    "That data isn't in our records. {reason}"
    "I can only work with the columns present in the customer, product, and "
    "order tables — try asking a question that fits."
)


def _format_refusal(template: str, block_reason: str | None) -> str:
    reason = (block_reason or "").strip()
    if reason and not reason.endswith((".", "!", "?")):
        reason += "."
    prefix = f"{reason} " if reason else ""
    return template.format(reason=prefix)

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
            state["answer"] = _format_refusal(REFUSAL_DESTRUCTIVE, state.get("block_reason"))
        elif state.get("intent_type") == "system_access":
            state["answer"] = _format_refusal(REFUSAL_SYSTEM_ACCESS, state.get("block_reason"))
        elif state.get("intent_type") == "data_unavailable":
            state["answer"] = _format_refusal(REFUSAL_DATA_UNAVAILABLE, state.get("block_reason"))
        elif state.get("intent_type") == "out_of_scope" or state.get("in_scope") is False:
            state["answer"] = _format_refusal(REFUSAL_OUT_OF_SCOPE, state.get("block_reason"))
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
    lower = err.lower()
    if "multi-statement" in lower:
        return "That request was blocked because it contained multiple statements — I can only run one at a time."
    if "only select" in lower or "not_select" in lower:
        return "That request was blocked because I can only read data, not modify it."
    if "unknown table" in lower:
        return "That request was blocked because it referred to a table outside the business data (customers, products, orders, order_items)."
    if "could not be parsed" in lower or "unparseable" in lower:
        return "I built a query that wasn't valid SQL. Try rephrasing your question."
    if "timeout" in lower or "exceeded" in lower:
        return "That query took too long to run. Try a narrower question."
    return "I couldn't build a valid query for that — could you rephrase it?"
