from dataclasses import dataclass, field

from openai import AsyncOpenAI
from sqlalchemy import text

from ..business_db import engine
from ..config import get_settings


@dataclass(frozen=True)
class RetrievedContext:
    few_shots: list[tuple[str, str]] = field(default_factory=list)
    column_docs: list[tuple[str, str, str]] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.few_shots and not self.column_docs


async def get_context(question: str) -> RetrievedContext:
    settings = get_settings()
    if not settings.rag_enabled:
        return RetrievedContext()

    client = AsyncOpenAI(api_key=settings.llm_api_key)
    response = await client.embeddings.create(
        input=question, model=settings.embedding_model
    )
    emb = response.data[0].embedding
    vec_literal = "[" + ",".join(str(x) for x in emb) + "]"

    async with engine().connect() as conn:
        few_shot_rows = (
            await conn.execute(
                text(
                    "SELECT question, sql FROM few_shots "
                    "ORDER BY embedding <=> :e LIMIT :k"
                ),
                {"e": vec_literal, "k": settings.rag_top_k_examples},
            )
        ).all()

        column_doc_rows = (
            await conn.execute(
                text(
                    "SELECT table_name, column_name, description FROM column_docs "
                    "ORDER BY embedding <=> :e LIMIT :k"
                ),
                {"e": vec_literal, "k": settings.rag_top_k_column_docs},
            )
        ).all()

    return RetrievedContext(
        few_shots=[(r.question, r.sql) for r in few_shot_rows],
        column_docs=[
            (r.table_name, r.column_name, r.description) for r in column_doc_rows
        ],
    )
