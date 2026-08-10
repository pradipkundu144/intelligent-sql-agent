"""RAGAS faithfulness + answer_relevancy — LLM-as-judge scoring on positive-set explanations."""

from __future__ import annotations

from dataclasses import dataclass

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.dataset_schema import SingleTurnSample
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import AnswerRelevancy, Faithfulness

from app.agent.graph import graph
from app.config import get_settings

from eval.metrics.execution_accuracy import CaseResult, MetricResult


JUDGE_MODEL = "gpt-4o-mini"
EMBED_MODEL = "text-embedding-3-small"


@dataclass
class RagasCaseResult(CaseResult):
    faithfulness: float | None = None
    answer_relevancy: float | None = None


@dataclass
class RagasMetricResult(MetricResult):
    name: str = "ragas"
    faithfulness_mean: float = 0.0
    answer_relevancy_mean: float = 0.0


def _render_row(row: dict) -> str:
    return ", ".join(f"{k} = {v}" for k, v in row.items())


def _build_contexts(question: str, sql: str | None, rows: list[dict], limit: int = 50) -> list[str]:
    contexts = [f"Question asked: {question}"]
    if sql:
        contexts.append(f"SQL executed: {sql}")
    contexts.extend(_render_row(r) for r in rows[:limit])
    return contexts


async def run(dataset: list[dict]) -> RagasMetricResult:
    settings = get_settings()
    judge_llm = LangchainLLMWrapper(
        ChatOpenAI(model=JUDGE_MODEL, temperature=0, api_key=settings.llm_api_key)
    )
    judge_embed = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(model=EMBED_MODEL, api_key=settings.llm_api_key)
    )
    faithfulness = Faithfulness(llm=judge_llm)
    answer_relevancy = AnswerRelevancy(llm=judge_llm, embeddings=judge_embed)

    result = RagasMetricResult(total=len(dataset))
    g = graph()
    faith_scores: list[float] = []
    rel_scores: list[float] = []

    for entry in dataset:
        state = await g.ainvoke({"question": entry["question"], "attempt_count": 1})

        if state.get("error") or state.get("intent_type") != "query" or not state.get("answer"):
            result.cases.append(
                RagasCaseResult(
                    id=entry["id"],
                    category=entry.get("category", ""),
                    question=entry["question"],
                    passed=False,
                    reason="skipped — no answer to score (agent blocked or errored)",
                    sql=state.get("sql"),
                )
            )
            continue

        sample = SingleTurnSample(
            user_input=entry["question"],
            response=state["answer"],
            retrieved_contexts=_build_contexts(
                entry["question"], state.get("sql"), state.get("rows") or []
            ),
        )

        try:
            faith = float(await faithfulness.single_turn_ascore(sample))
            rel = float(await answer_relevancy.single_turn_ascore(sample))
        except Exception as exc:
            result.cases.append(
                RagasCaseResult(
                    id=entry["id"],
                    category=entry.get("category", ""),
                    question=entry["question"],
                    passed=False,
                    reason=f"ragas error: {exc}",
                    sql=state.get("sql"),
                )
            )
            continue

        faith_scores.append(faith)
        rel_scores.append(rel)
        passed = faith >= 0.80 and rel >= 0.80
        if passed:
            result.passed += 1
        result.cases.append(
            RagasCaseResult(
                id=entry["id"],
                category=entry.get("category", ""),
                question=entry["question"],
                passed=passed,
                reason=f"faithfulness={faith:.2f}, answer_relevancy={rel:.2f}",
                sql=state.get("sql"),
                row_count=len(state.get("rows") or []),
                faithfulness=faith,
                answer_relevancy=rel,
            )
        )

    if faith_scores:
        result.faithfulness_mean = sum(faith_scores) / len(faith_scores)
    if rel_scores:
        result.answer_relevancy_mean = sum(rel_scores) / len(rel_scores)

    return result
