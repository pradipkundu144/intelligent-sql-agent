from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .config import get_settings


def _make_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(
        settings.readonly_dsn,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"server_settings": {"search_path": "business,public"}},
    )


_engine: AsyncEngine | None = None


def engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _make_engine()
    return _engine


async def ping() -> bool:
    async with engine().connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        return result.scalar_one() == 1


async def close() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None
