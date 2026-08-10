"""Eval orchestrator — runs all metrics, prints pass-rate table, writes latest.json."""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from eval.metrics import execution_accuracy, graceful_handling, guardrail_catch, ragas_faithfulness


DATASET_DIR = Path(__file__).parent / "dataset"
RESULTS_DIR = Path(__file__).parent / "results"


def _load(name: str) -> list[dict]:
    return json.loads((DATASET_DIR / f"{name}.json").read_text())


def _format_table(results: list) -> str:
    header = f"{'Metric':<24} {'Pass':>10} {'Rate':>8}  Notes"
    sep = "-" * len(header)
    lines = [header, sep]
    for r in results:
        pass_str = f"{r.passed}/{r.total}"
        rate_str = f"{r.rate * 100:.1f}%"
        notes = ""
        if r.name == "ragas":
            notes = (
                f"faithfulness={r.faithfulness_mean:.2f}, "
                f"answer_relevancy={r.answer_relevancy_mean:.2f}"
            )
        lines.append(f"{r.name:<24} {pass_str:>10} {rate_str:>8}  {notes}")
    return "\n".join(lines)


def _serialise(results: list) -> dict:
    return {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "metrics": [asdict(r) for r in results],
    }


async def main() -> None:
    positive = _load("positive")
    negative = _load("negative")
    neutral = _load("neutral")

    print(f"Running eval — positive:{len(positive)}, negative:{len(negative)}, neutral:{len(neutral)}\n")

    exec_acc = await execution_accuracy.run(positive)
    print(f"  ✓ execution_accuracy done ({exec_acc.passed}/{exec_acc.total})")

    guard = await guardrail_catch.run(negative)
    print(f"  ✓ guardrail_catch done ({guard.passed}/{guard.total})")

    grace = await graceful_handling.run(neutral)
    print(f"  ✓ graceful_handling done ({grace.passed}/{grace.total})")

    ragas = await ragas_faithfulness.run(positive)
    print(f"  ✓ ragas done ({ragas.passed}/{ragas.total})\n")

    results = [exec_acc, guard, grace, ragas]
    print(_format_table(results))

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / "latest.json"
    out.write_text(json.dumps(_serialise(results), indent=2, default=str))
    print(f"\nWrote {out.relative_to(Path(__file__).parent.parent)}")


if __name__ == "__main__":
    asyncio.run(main())
