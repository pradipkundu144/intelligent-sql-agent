"""Run one question through RAGAS with debug logging to see the judge's reasoning.

Usage:
    docker compose exec backend python -m eval.debug_ragas "How many products do we sell?"
"""

from __future__ import annotations

import asyncio
import logging
import sys

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.dataset_schema import SingleTurnSample
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import AnswerRelevancy, Faithfulness

from app.agent.graph import graph
from app.config import get_settings

from eval.metrics.ragas_faithfulness import _build_contexts


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
    for name in ("ragas", "ragas.metrics", "openai", "httpx"):
        logging.getLogger(name).setLevel(logging.DEBUG)


async def main(question: str) -> None:
    _configure_logging()
    settings = get_settings()

    state = await graph().ainvoke({"question": question, "attempt_count": 1})
    answer = state.get("answer") or ""
    sql = state.get("sql")
    rows = state.get("rows") or []

    print("\n" + "=" * 70)
    print(f"QUESTION: {question}")
    print(f"ANSWER:   {answer}")
    print(f"SQL:      {sql}")
    print(f"ROWS:     {rows[:5]}{'...' if len(rows) > 5 else ''}")
    print("=" * 70 + "\n")

    contexts = _build_contexts(question, sql, rows)
    print("CONTEXTS FED TO RAGAS:")
    for i, c in enumerate(contexts[:10]):
        print(f"  [{i}] {c}")
    if len(contexts) > 10:
        print(f"  ...and {len(contexts) - 10} more")
    print()

    judge_llm = LangchainLLMWrapper(
        ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=settings.llm_api_key)
    )
    judge_embed = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(model="text-embedding-3-small", api_key=settings.llm_api_key)
    )
    faithfulness = Faithfulness(llm=judge_llm)
    answer_relevancy = AnswerRelevancy(llm=judge_llm, embeddings=judge_embed)

    sample = SingleTurnSample(
        user_input=question,
        response=answer,
        retrieved_contexts=contexts,
    )

    print("\n--- FAITHFULNESS SCORING ---")
    faith = await faithfulness.single_turn_ascore(sample)
    print(f"\nFAITHFULNESS SCORE: {faith:.2f}")

    print("\n--- ANSWER RELEVANCY SCORING ---")
    rel = await answer_relevancy.single_turn_ascore(sample)
    print(f"\nANSWER_RELEVANCY SCORE: {rel:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
