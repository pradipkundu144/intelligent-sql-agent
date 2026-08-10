"""Execution accuracy — runs positive-set questions through the agent and asserts result shape."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agent.graph import graph


@dataclass
class CaseResult:
    id: str
    category: str
    question: str
    passed: bool
    reason: str
    sql: str | None = None
    row_count: int | None = None


@dataclass
class MetricResult:
    name: str = "execution_accuracy"
    total: int = 0
    passed: int = 0
    cases: list[CaseResult] = field(default_factory=list)

    @property
    def rate(self) -> float:
        return self.passed / self.total if self.total else 0.0


def _extract_scalar(rows: list[dict]) -> Any:
    if not rows:
        return None
    first = rows[0]
    if len(first) != 1:
        return None
    return next(iter(first.values()))


def _column_names(rows: list[dict]) -> set[str]:
    return set(rows[0].keys()) if rows else set()


def _assert(state: dict, expected: dict) -> tuple[bool, str]:
    rows = state.get("rows") or []
    total = state.get("total_row_count", len(rows))
    kind = expected["kind"]

    if kind == "scalar":
        actual = _extract_scalar(rows)
        if actual is None:
            return False, f"expected scalar, got {len(rows)} rows"
        if "value" in expected:
            tol = expected.get("tolerance", 0)
            if abs(float(actual) - float(expected["value"])) > tol:
                return False, f"scalar {actual} != {expected['value']} (tol {tol})"
        if "min" in expected and float(actual) < expected["min"]:
            return False, f"scalar {actual} < min {expected['min']}"
        return True, f"scalar={actual}"

    if kind == "scalar_range":
        actual = _extract_scalar(rows)
        if actual is None:
            return False, f"expected scalar, got {len(rows)} rows"
        if not (expected["min"] <= float(actual) <= expected["max"]):
            return False, f"scalar {actual} outside [{expected['min']}, {expected['max']}]"
        return True, f"scalar={actual} in range"

    if kind == "scalar_count":
        actual = _extract_scalar(rows)
        if actual is None or int(actual) != int(expected["value"]):
            return False, f"count {actual} != {expected['value']}"
        return True, f"count={actual}"

    if kind == "row_count":
        n = total or len(rows)
        if "min" in expected and n < expected["min"]:
            return False, f"rows {n} < min {expected['min']}"
        if "max" in expected and n > expected["max"]:
            return False, f"rows {n} > max {expected['max']}"
        if "columns_include" in expected:
            cols = _column_names(rows)
            missing = set(expected["columns_include"]) - cols
            if missing:
                return False, f"columns missing: {sorted(missing)}"
        return True, f"rows={n}"

    if kind == "columns_present":
        cols = _column_names(rows)
        missing = set(expected["columns"]) - cols
        if missing:
            return False, f"columns missing: {sorted(missing)}"
        return True, f"columns={sorted(cols)}"

    return False, f"unknown assertion kind: {kind}"


async def run(dataset: list[dict]) -> MetricResult:
    result = MetricResult(total=len(dataset))
    g = graph()

    for entry in dataset:
        state = await g.ainvoke({"question": entry["question"], "attempt_count": 1})

        if state.get("error"):
            case = CaseResult(
                id=entry["id"],
                category=entry.get("category", ""),
                question=entry["question"],
                passed=False,
                reason=f"agent error: {state['error']}",
                sql=state.get("sql"),
            )
        elif state.get("intent_type") and state.get("intent_type") != "query":
            case = CaseResult(
                id=entry["id"],
                category=entry.get("category", ""),
                question=entry["question"],
                passed=False,
                reason=f"unexpected block: intent_type={state['intent_type']}",
                sql=state.get("sql"),
            )
        else:
            ok, why = _assert(state, entry["expected"])
            case = CaseResult(
                id=entry["id"],
                category=entry.get("category", ""),
                question=entry["question"],
                passed=ok,
                reason=why,
                sql=state.get("sql"),
                row_count=state.get("total_row_count", len(state.get("rows") or [])),
            )

        if case.passed:
            result.passed += 1
        result.cases.append(case)

    return result
