import logging
import time
from typing import Literal

from pydantic import BaseModel

from ...llm import chat_json
from ...rag.retrieve import RetrievedContext, get_context
from ..prompts import SCHEMA_DDL
from ..state import AgentState

logger = logging.getLogger(__name__)


class _IntentResult(BaseModel):
    intent_type: Literal[
        "query", "destructive", "system_access", "data_unavailable", "out_of_scope"
    ]
    intent: str
    block_reason: str | None = None


PROMPT = """You are the intent classifier for a business analytics SQL agent.

The agent is READ-ONLY. It can answer questions about customers, products,
orders, and order items using ONLY the columns shown in the schema below.

{schema}
{column_notes}{intent_examples}

Classify the input into one of five categories:

- "query" — a well-formed question about the customer/product/order data that
  can be answered by running a SELECT statement using the ACTUAL COLUMNS shown
  in the schema above. Examples: "how many customers", "revenue by month",
  "top 5 products by sales".

- "destructive" — any request to modify, delete, insert, drop, update, truncate,
  alter, or otherwise change data. These are commands, not questions — and the
  agent is read-only and cannot perform them. Examples: "delete all customers",
  "drop the orders table", "update product 3 price to 99", "insert a new row".
  This applies even if the request is phrased politely or as a question
  ("can you delete...", "how would I remove...").

- "system_access" — asking about DB INTERNALS: pg_user, pg_catalog,
  information_schema, sqlite_master, mysql.user, pg_shadow, pg_stat_*,
  or database-level metadata such as which schemas/roles/permissions/users
  exist in the DATABASE ITSELF (not in the business data).
  Distinguishing signal: the user is asking about the DATABASE ENGINE's
  internal state, not about the business data (customers, products, orders,
  order_items) stored in it.
  Examples: "show pg_user", "list all databases", "who are the DB users",
  "show information_schema.tables", "what schemas exist in postgres",
  "what tables are in this database".
  NOT this category — always classify as "query" instead:
  * "list all customers", "list all products", "list all orders" — these are
    questions about business data.
  * Any question referencing customers/products/orders/order_items by name.
  * Any question about revenue, sales, counts, aggregations of the business
    tables.
  The four business tables (customers, products, orders, order_items) are
  ALWAYS in-scope for "query"; questions about them are never system_access.

- "data_unavailable" — the user's question IS about business data (a legitimate
  topic for this agent), BUT the specific fields or attributes they want DO NOT
  EXIST in the schema above. Examples:
  * "show me customer emails" — customers table has no email column
  * "what's each customer's phone number" — no phone column
  * "show product inventory / stock levels" — no stock column on products
  * "show shipping tracking numbers" — no tracking column on orders
  * "what's the return reason for cancelled orders" — no return_reason field
  * "show customer age / date of birth" — no age or dob column
  * "customer segments / tiers / loyalty status" — no segment/tier column
  Rule of thumb: if the user names a specific attribute and that word doesn't
  appear (or clearly relate) to any column in the schema, this is
  `data_unavailable`. Do NOT classify as `query` and let the SQL generator
  substitute a related column silently — be honest and say the data isn't
  available.

- "out_of_scope" — inputs outside the customer/product/order data domain, or
  inputs the agent cannot reasonably answer (weather, general knowledge,
  gibberish, ambiguous nonsense). Examples: "what is the weather", "who won
  the world cup", "asdfghjkl", "tell me a joke".

Question: {question}

Return:
- intent_type: one of the five literals above
- intent: one-sentence description of what the user is asking
- block_reason: when intent_type is not "query", write ONE short sentence that
  names specifically what got blocked (e.g. "You asked to delete all customer
  records.", "You asked about the pg_user table, a PostgreSQL internal table.",
  "You asked for customer email addresses, but the customers table doesn't
  store emails.", "This asks about the weather, which isn't in the business
  data."). When intent_type is "query", leave block_reason null.
"""


async def understand(state: AgentState) -> AgentState:
    started = time.perf_counter()
    try:
        try:
            context = await get_context(state["question"])
        except Exception as exc:
            logger.warning("rag.retrieve failed in understand, continuing without context: %s", exc)
            context = RetrievedContext()

        state["retrieved_context"] = {
            "few_shots": list(context.few_shots),
            "column_docs": list(context.column_docs),
        }

        usage_sink = state.setdefault("stage_tokens", {}).setdefault("understand", {})
        result = await chat_json(
            PROMPT.format(
                schema=SCHEMA_DDL,
                column_notes=_format_column_notes(context),
                intent_examples=_format_intent_examples(context),
                question=state["question"],
            ),
            schema=_IntentResult,
            model="gpt-4o-mini",
            trace_id=state.get("trace_id"),
            span_name="understand",
            usage_sink=usage_sink,
        )
        state["intent_type"] = result.intent_type
        state["intent"] = result.intent
        state["in_scope"] = result.intent_type == "query"
        if result.block_reason:
            state["block_reason"] = result.block_reason
    except Exception as exc:
        state["error"] = f"understand failed: {exc}"
    finally:
        state.setdefault("stage_timings", {})["understand"] = int((time.perf_counter() - started) * 1000)
    return state


def _format_column_notes(context: RetrievedContext) -> str:
    if not context.column_docs:
        return ""
    lines = [
        f"- {table}.{column}: {description}"
        for table, column, description in context.column_docs
    ]
    return "\nRelevant column notes:\n" + "\n".join(lines) + "\n"


def _format_intent_examples(context: RetrievedContext) -> str:
    if not context.few_shots:
        return ""
    lines = [f'- "{question}"' for question, _sql in context.few_shots]
    return (
        "\nExamples of well-formed queries the agent has answered before — "
        "each has a clear SUBJECT (customers / products / orders / order_items) "
        "AND a clear metric, filter, or aggregation. Use them as reinforcement "
        "only when the user's question ALSO has a clear subject AND clear ask. "
        "Vague, subject-less, or metric-less questions ('the good ones', "
        "'show me stuff') should still be classified as out_of_scope, no matter "
        "how similar they sound to these examples.\n"
        + "\n".join(lines)
        + "\n"
    )
