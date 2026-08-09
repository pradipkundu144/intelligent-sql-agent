import asyncio
from contextvars import ContextVar

current_event_queue: ContextVar["asyncio.Queue | None"] = ContextVar(
    "current_event_queue", default=None
)
