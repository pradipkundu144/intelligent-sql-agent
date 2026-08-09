from langgraph.graph import END, StateGraph

from ..config import get_settings
from .nodes.execute import execute
from .nodes.explain import explain
from .nodes.generate import generate
from .nodes.understand import understand
from .nodes.validate import validate
from .state import AgentState


def _after_understand(state: AgentState) -> str:
    if state.get("error") or state.get("in_scope") is False:
        return "explain"
    return "generate"


def _after_validate(state: AgentState) -> str:
    if not state.get("error"):
        return "execute"
    return _maybe_retry(state)


def _after_execute(state: AgentState) -> str:
    if not state.get("error"):
        return "explain"
    return _maybe_retry(state)


def _maybe_retry(state: AgentState) -> str:
    settings = get_settings()
    if state.get("attempt_count", 1) >= settings.max_retries:
        return "explain"
    state["attempt_count"] = state.get("attempt_count", 1) + 1
    return "retry"


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("understand", understand)
    g.add_node("generate", generate)
    g.add_node("validate", validate)
    g.add_node("execute", execute)
    g.add_node("explain", explain)

    g.set_entry_point("understand")
    g.add_conditional_edges(
        "understand", _after_understand, {"generate": "generate", "explain": "explain"}
    )
    g.add_edge("generate", "validate")
    g.add_conditional_edges(
        "validate",
        _after_validate,
        {"execute": "execute", "retry": "generate", "explain": "explain"},
    )
    g.add_conditional_edges(
        "execute",
        _after_execute,
        {"explain": "explain", "retry": "generate"},
    )
    g.add_edge("explain", END)

    return g.compile()


_compiled = None


def graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled
