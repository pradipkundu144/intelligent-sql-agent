from dataclasses import dataclass
from typing import Literal

import sqlglot
from sqlglot import exp

ALLOWED_SCHEMA: dict[str, set[str]] = {
    "customers": {"customer_id", "name", "city", "state", "join_date"},
    "products": {"product_id", "product_name", "category", "price"},
    "orders": {"order_id", "customer_id", "order_date", "total_amount", "status"},
    "order_items": {"order_item_id", "order_id", "product_id", "quantity", "unit_price"},
}


FailedCheck = Literal[
    "unparseable",
    "multi_statement",
    "not_select",
    "unknown_table",
]


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    reason: str | None = None
    failed_check: FailedCheck | None = None


def validate_sql(sql: str) -> ValidationResult:
    try:
        parsed = [s for s in sqlglot.parse(sql, dialect="postgres") if s is not None]
    except Exception as exc:
        return ValidationResult(
            ok=False,
            reason=f"SQL could not be parsed: {exc}",
            failed_check="unparseable",
        )

    if len(parsed) != 1:
        return ValidationResult(
            ok=False,
            reason=f"multi-statement queries are not allowed (got {len(parsed)} statements)",
            failed_check="multi_statement",
        )

    stmt = parsed[0]

    if not isinstance(stmt, exp.Select):
        return ValidationResult(
            ok=False,
            reason="only SELECT statements are allowed",
            failed_check="not_select",
        )

    cte_aliases = {c.alias_or_name.lower() for c in stmt.find_all(exp.CTE)}
    for table_node in stmt.find_all(exp.Table):
        name = table_node.name.lower()
        if name in cte_aliases:
            continue
        if name not in ALLOWED_SCHEMA:
            return ValidationResult(
                ok=False,
                reason=f"unknown table '{table_node.name}' — not in the business schema",
                failed_check="unknown_table",
            )

    return ValidationResult(ok=True)
