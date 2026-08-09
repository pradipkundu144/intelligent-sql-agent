from typing import TypedDict


class AgentState(TypedDict, total=False):
    question: str
    in_scope: bool
    intent_type: str
    intent: str
    sql: str
    rows: list[dict]
    total_row_count: int
    overflow: bool
    answer: str
    error: str
    stage_timings: dict[str, int]
