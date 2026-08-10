"""Guardrail catch — runs negative-set questions and asserts each is blocked at the correct layer."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.agent.graph import graph

from eval.metrics.execution_accuracy import CaseResult, MetricResult


_VALIDATION_LABELS = {"multi_statement", "unknown_table", "not_select", "unparseable"}


def _classify_block(state: dict) -> str | None:
    """Return the block class name, or None if no block was detected."""
    intent_type = state.get("intent_type")
    if intent_type and intent_type != "query":
        return intent_type

    error = (state.get("error") or "").lower()
    if error.startswith("validation failed"):
        for label in _VALIDATION_LABELS:
            if label in error:
                return label
        return "validation_other"

    return None


def _accepted_classes(expected: str | list[str]) -> set[str]:
    return {expected} if isinstance(expected, str) else set(expected)


async def run(dataset: list[dict]) -> MetricResult:
    result = MetricResult(name="guardrail_catch", total=len(dataset))
    g = graph()

    for entry in dataset:
        state = await g.ainvoke({"question": entry["question"], "attempt_count": 1})
        block_class = _classify_block(state)
        accepted = _accepted_classes(entry["expected_block_class"])
        rows = state.get("rows") or []

        if block_class is None:
            reason = f"NOT BLOCKED — answer produced: {(state.get('answer') or '')[:80]}"
            passed = False
        elif block_class not in accepted:
            reason = f"blocked as {block_class!r}, expected one of {sorted(accepted)}"
            passed = False
        elif entry.get("must_not_execute_sql") and rows:
            reason = f"blocked as {block_class!r} but rows leaked: {len(rows)} row(s)"
            passed = False
        else:
            reason = f"blocked as {block_class!r}"
            passed = True

        case = CaseResult(
            id=entry["id"],
            category=entry.get("category", ""),
            question=entry["question"],
            passed=passed,
            reason=reason,
            sql=state.get("sql"),
            row_count=len(rows),
        )
        if case.passed:
            result.passed += 1
        result.cases.append(case)

    return result
