from pydantic import BaseModel, Field

from ..config import get_settings
from ..llm import chat_json


class _DecomposeResult(BaseModel):
    reasoning: str
    subquestions: list[str] = Field(min_length=1, max_length=5)


PROMPT = """You split a user message into distinct SQL-answerable sub-questions.

RULES:
1. If the message asks ONE thing, return a list with ONE item (the original,
   lightly cleaned).
2. If the message asks 2–5 truly distinct things joined by "and", "also", ";",
   commas, or clear topic shifts, split into that many items.
3. NEVER split a comparison. "revenue this month vs last month" is ONE
   question — one SQL with two aggregates answers it.
4. NEVER split a filtered query. "top 5 customers in Maharashtra" is ONE
   question, not "top 5 customers" + "in Maharashtra".
5. Preserve destructive/out-of-scope intent — pass them through as-is; the
   downstream classifier handles them per-sub.
6. Cap at 5. If more, keep the first 5 in the order asked.
7. Each sub-question must be a complete, standalone question — no
   pronouns referring to other subs.

EXAMPLES:

Input: "How many customers?"
Output:
  reasoning: "single count question"
  subquestions: ["How many customers are there?"]

Input: "How many customers, and revenue by month?"
Output:
  reasoning: "two independent aggregations joined by 'and'"
  subquestions: [
    "How many customers are there?",
    "What is the revenue by month?"
  ]

Input: "Revenue this month vs last month"
Output:
  reasoning: "single comparison — one SQL with two aggregates"
  subquestions: ["Revenue this month vs last month"]

Input: "Top 5 customers in Maharashtra"
Output:
  reasoning: "single filtered top-N — one SQL"
  subquestions: ["Top 5 customers in Maharashtra"]

Input: "Delete all customers and show me revenue"
Output:
  reasoning: "one destructive command, one query — split so each is classified separately downstream"
  subquestions: [
    "Delete all customers",
    "Show me revenue"
  ]

Input: "How many customers, revenue this month, top 5 products, orders by state, revenue by category, average order value, top spenders"
Output:
  reasoning: "seven distinct questions; cap at 5, keeping the first 5"
  subquestions: [
    "How many customers are there?",
    "What is the revenue this month?",
    "What are the top 5 products?",
    "How many orders by state?",
    "What is the revenue by category?"
  ]

Message: {question}
"""


async def decompose(question: str, *, trace_id: str | None = None) -> list[str]:
    settings = get_settings()
    result = await chat_json(
        PROMPT.format(question=question),
        schema=_DecomposeResult,
        model="gpt-4o-mini",
        trace_id=trace_id,
        span_name="decompose",
    )
    return result.subquestions[: settings.max_subquestions]
