from typing import TypedDict


class AgentState(TypedDict, total=False):
    question: str
    in_scope: bool
    intent_type: str
    intent: str
    block_reason: str
    sql: str
    rows: list[dict]
    total_row_count: int
    overflow: bool
    answer: str
    error: str
    attempt_count: int
    trace_id: str
    stage_timings: dict[str, int]
    stage_tokens: dict[str, dict]
    retrieved_context: dict
