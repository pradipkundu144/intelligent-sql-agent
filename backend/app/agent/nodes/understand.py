import time
from typing import Literal

from pydantic import BaseModel

from ...llm import chat_json
from ..state import AgentState


class _IntentResult(BaseModel):
    intent_type: Literal["query", "destructive", "out_of_scope"]
    intent: str


PROMPT = """You are the intent classifier for a business analytics SQL agent.

The agent is READ-ONLY. It can answer questions about customers, products,
orders, and order items (revenue, counts, aggregations, trends, top-N, filters,
joins across those tables).

Classify the input into one of three categories:

- "query" — a well-formed question about the customer/product/order data that
  can be answered by running a SELECT statement. Examples: "how many customers",
  "revenue by month", "top 5 products by sales".

- "destructive" — any request to modify, delete, insert, drop, update, truncate,
  alter, or otherwise change data. These are commands, not questions — and the
  agent is read-only and cannot perform them. Examples: "delete all customers",
  "drop the orders table", "update product 3 price to 99", "insert a new row".
  This applies even if the request is phrased politely or as a question
  ("can you delete...", "how would I remove...").

- "out_of_scope" — inputs outside the customer/product/order data domain, or
  inputs the agent cannot reasonably answer (weather, general knowledge,
  gibberish, ambiguous nonsense). Examples: "what is the weather", "who won
  the world cup", "asdfghjkl".

Question: {question}

Return intent_type set to one of the three literals above, plus a
one-sentence intent description.
"""


async def understand(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        result = await chat_json(
            PROMPT.format(question=state["question"]),
            schema=_IntentResult,
            model="gpt-4o-mini",
        )
        state["intent_type"] = result.intent_type
        state["intent"] = result.intent
        state["in_scope"] = result.intent_type == "query"
    except Exception as exc:
        state["error"] = f"understand failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["understand"] = int((time.perf_counter() - started) * 1000)
    return state
