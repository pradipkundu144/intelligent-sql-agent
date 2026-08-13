from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import get_settings

_client: AsyncIOMotorClient | None = None
_service_state: bool = True


def _db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(get_settings().mongo_uri)
    return _client.get_default_database()


async def ping() -> bool:
    result = await _db().command("ping")
    return result.get("ok") == 1.0


async def save_turn(
    *,
    question: str,
    sql: str | None,
    results_summary: dict[str, Any] | None,
    trace_id: str | None,
    outcome: str,
) -> None:
    await _db().turns.insert_one(
        {
            "question": question,
            "sql": sql,
            "results_summary": results_summary,
            "trace_id": trace_id,
            "outcome": outcome,
            "created_at": datetime.now(timezone.utc),
        }
    )


def get_service_state() -> bool:
    return _service_state


async def load_service_state() -> None:
    global _service_state
    doc = await _db().settings.find_one({"_id": "service_state"})
    if doc is not None and doc.get("available") is not None:
        _service_state = bool(doc["available"])


async def set_service_state(available: bool) -> None:
    global _service_state
    await _db().settings.update_one(
        {"_id": "service_state"},
        {"$set": {"available": available, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    _service_state = available


async def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
