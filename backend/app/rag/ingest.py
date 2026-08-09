import json
import logging
from pathlib import Path

from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from ..config import get_settings

logger = logging.getLogger(__name__)

_EXAMPLES_PATH = Path(__file__).parent / "examples.json"
_COLUMN_DOCS_PATH = Path(__file__).parent / "column_docs.json"


async def run() -> None:
    settings = get_settings()
    engine = create_async_engine(
        settings.app_dsn,
        connect_args={"server_settings": {"search_path": "business,public"}},
    )
    client = AsyncOpenAI(api_key=settings.llm_api_key)

    try:
        async with engine.connect() as conn:
            existing = (await conn.execute(text("SELECT COUNT(*) FROM few_shots"))).scalar_one()
            if existing and existing > 0:
                logger.info("rag.ingest: %s few_shots already present, skipping", existing)
                return

            examples = json.loads(_EXAMPLES_PATH.read_text())
            column_docs = json.loads(_COLUMN_DOCS_PATH.read_text())

            for ex in examples:
                emb = await _embed(client, ex["question"], settings.embedding_model)
                await conn.execute(
                    text(
                        "INSERT INTO few_shots (question, sql, embedding) "
                        "VALUES (:q, :s, :e)"
                    ),
                    {"q": ex["question"], "s": ex["sql"], "e": _vec(emb)},
                )

            for doc in column_docs:
                text_to_embed = f"{doc['table']}.{doc['column']}: {doc['description']}"
                emb = await _embed(client, text_to_embed, settings.embedding_model)
                await conn.execute(
                    text(
                        "INSERT INTO column_docs "
                        "(table_name, column_name, description, embedding) "
                        "VALUES (:t, :c, :d, :e)"
                    ),
                    {
                        "t": doc["table"],
                        "c": doc["column"],
                        "d": doc["description"],
                        "e": _vec(emb),
                    },
                )

            await conn.commit()
            logger.info(
                "rag.ingest: inserted %s few_shots and %s column_docs",
                len(examples),
                len(column_docs),
            )
    finally:
        await engine.dispose()


async def _embed(client: AsyncOpenAI, content: str, model: str) -> list[float]:
    response = await client.embeddings.create(input=content, model=model)
    return response.data[0].embedding


def _vec(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"
