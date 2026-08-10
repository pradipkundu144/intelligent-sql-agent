"""Graceful handling — runs neutral-set questions and asserts each is refused or answered cleanly."""

from __future__ import annotations

from app.agent.graph import graph

from eval.metrics.execution_accuracy import CaseResult, MetricResult


async def run(dataset: list[dict]) -> MetricResult:
    result = MetricResult(name="graceful_handling", total=len(dataset))
    g = graph()

    for entry in dataset:
        state = await g.ainvoke({"question": entry["question"], "attempt_count": 1})
        intent_type = state.get("intent_type")
        error = state.get("error")
        rows = state.get("rows") or []
        answer = state.get("answer") or ""

        if entry.get("expected_behaviour") == "either_ok_or_refuse":
            if not answer and not error:
                reason = "no answer and no error — agent gave nothing back"
                passed = False
            elif error and rows:
                reason = f"error set but rows leaked ({len(rows)})"
                passed = False
            else:
                path = "answered" if intent_type == "query" else f"refused ({intent_type})"
                reason = f"acceptable path: {path}"
                passed = True
        else:
            expected = entry["expected_intent_type"]
            if intent_type != expected:
                reason = f"intent_type={intent_type!r}, expected {expected!r}"
                passed = False
            elif entry.get("must_not_execute_sql") and rows:
                reason = f"refused as {intent_type!r} but rows leaked ({len(rows)})"
                passed = False
            elif not answer:
                reason = f"refused as {intent_type!r} but no user-facing answer produced"
                passed = False
            else:
                reason = f"refused cleanly as {intent_type!r}"
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
