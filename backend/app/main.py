import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import business_db, chat
from .agent.decompose import decompose
from .agent.graph import graph
from .config import get_settings
from .logging_config import configure_logging
from .observability.event_bus import current_event_queue
from .observability.langfuse import get_langfuse
from .rag import ingest as rag_ingest

KNOWN_NODES = {"understand", "generate", "validate", "execute", "explain"}

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    try:
        await rag_ingest.run()
    except Exception as exc:
        logger.warning("rag.ingest failed at startup, continuing without RAG data: %s", exc)
    yield
    await chat.close()
    await business_db.close()


app = FastAPI(title="Intelligent SQL AI Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str


@app.get("/health")
async def health():
    postgres_ok = await business_db.ping()
    mongo_ok = await chat.ping()
    status = "ok" if (postgres_ok and mongo_ok) else "degraded"
    return {"status": status, "postgres": postgres_ok, "mongodb": mongo_ok}


def _outcome_from(result: dict) -> str:
    intent_type = result.get("intent_type")
    if result.get("error"):
        return "error"
    if intent_type == "destructive":
        return "blocked"
    if intent_type == "out_of_scope":
        return "out_of_scope"
    return "ok"


async def _run_one(
    question: str,
    trace_id: str | None,
    trace_url: str | None,
    parent_question: str | None = None,
) -> dict:
    result = await graph().ainvoke(
        {"question": question, "attempt_count": 1, "trace_id": trace_id}
    )
    payload = {
        "question": question,
        "answer": result.get("answer"),
        "sql": result.get("sql"),
        "rows": result.get("rows"),
        "total_row_count": result.get("total_row_count"),
        "overflow": result.get("overflow", False),
        "in_scope": result.get("in_scope"),
        "intent_type": result.get("intent_type"),
        "attempt_count": result.get("attempt_count", 1),
        "trace_id": trace_id,
        "trace_url": trace_url,
        "error": result.get("error"),
        "stage_timings": result.get("stage_timings", {}),
        "stage_tokens": result.get("stage_tokens", {}),
    }
    await chat.save_turn(
        question=question,
        sql=result.get("sql"),
        results_summary={
            "row_count": len(result.get("rows") or []),
            "total_row_count": result.get("total_row_count"),
            "overflow": result.get("overflow", False),
            "attempt_count": result.get("attempt_count", 1),
            "error": result.get("error"),
            "parent_question": parent_question,
        },
        trace_id=trace_id,
        outcome=_outcome_from(result),
    )
    return payload


def _new_trace(question: str) -> tuple[str | None, object | None, str | None]:
    settings = get_settings()
    client = get_langfuse()
    if not client:
        return None, None, None
    try:
        trace = client.trace(name="query", input={"question": question})
        trace_id = trace.id
        trace_url = None
        if trace_id and settings.langfuse_project_id:
            trace_url = (
                f"{settings.langfuse_host.rstrip('/')}/project/"
                f"{settings.langfuse_project_id}/traces/{trace_id}"
            )
        return trace_id, trace, trace_url
    except Exception as exc:
        logger.warning("langfuse: trace creation failed: %s", exc)
        return None, None, None


def _flush_trace(trace, summary_output: dict) -> None:
    if trace:
        try:
            trace.update(output=summary_output)
        except Exception:
            pass
    client = get_langfuse()
    if client:
        try:
            client.flush()
        except Exception:
            pass


@app.post("/query")
async def query(req: QueryRequest):
    subquestions = await decompose(req.question)

    if len(subquestions) == 1:
        trace_id, trace, trace_url = _new_trace(subquestions[0])
        payload = await _run_one(subquestions[0], trace_id, trace_url)
        _flush_trace(trace, {"answer": payload.get("answer")})
        return payload

    parent_trace_id, parent_trace, parent_trace_url = _new_trace(req.question)
    tasks = [
        _run_one(sub, parent_trace_id, parent_trace_url, parent_question=req.question)
        for sub in subquestions
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    blocks: list[dict] = []
    for sub, r in zip(subquestions, results):
        if isinstance(r, Exception):
            blocks.append({
                "question": sub,
                "answer": "This part of your request failed unexpectedly.",
                "error": f"internal error: {r}",
                "sql": None,
                "rows": None,
                "total_row_count": None,
                "overflow": False,
                "in_scope": None,
                "intent_type": None,
                "attempt_count": 1,
                "trace_id": parent_trace_id,
                "trace_url": parent_trace_url,
                "stage_timings": {},
                "stage_tokens": {},
            })
        else:
            blocks.append(r)

    _flush_trace(parent_trace, {"block_count": len(blocks)})

    return {
        "parent_question": req.question,
        "block_count": len(blocks),
        "parent_trace_id": parent_trace_id,
        "parent_trace_url": parent_trace_url,
        "blocks": blocks,
    }


class _TaggedQueue:
    def __init__(self, real_queue: asyncio.Queue, sub_index: int) -> None:
        self._q = real_queue
        self._sub = sub_index

    async def put(self, event: dict) -> None:
        tagged = {**event, "sub": self._sub}
        await self._q.put(tagged)


async def _run_sub_streaming(
    sub_index: int,
    question: str,
    trace_id: str | None,
    trace_url: str | None,
    parent_question: str,
    shared_queue: asyncio.Queue,
) -> dict:
    tagged = _TaggedQueue(shared_queue, sub_index)
    current_event_queue.set(tagged)  # type: ignore[arg-type]

    initial_state = {"question": question, "attempt_count": 1, "trace_id": trace_id}
    final_state: dict = {}

    async for event in graph().astream_events(initial_state, version="v1"):
        ev_type = event.get("event")
        name = event.get("name")
        if name in KNOWN_NODES:
            if ev_type == "on_chain_start":
                await tagged.put({
                    "type": "stage_start",
                    "stage": name,
                    "t": int(time.time() * 1000),
                })
            elif ev_type == "on_chain_end":
                await tagged.put({
                    "type": "stage_end",
                    "stage": name,
                    "t": int(time.time() * 1000),
                })
        if ev_type == "on_chain_end":
            node_output = event.get("data", {}).get("output")
            if isinstance(node_output, dict):
                final_state.update(node_output)

    result = final_state
    payload = {
        "question": question,
        "answer": result.get("answer"),
        "sql": result.get("sql"),
        "rows": result.get("rows"),
        "total_row_count": result.get("total_row_count"),
        "overflow": result.get("overflow", False),
        "in_scope": result.get("in_scope"),
        "intent_type": result.get("intent_type"),
        "attempt_count": result.get("attempt_count", 1),
        "trace_id": trace_id,
        "trace_url": trace_url,
        "error": result.get("error"),
        "stage_timings": result.get("stage_timings", {}),
        "stage_tokens": result.get("stage_tokens", {}),
    }
    await chat.save_turn(
        question=question,
        sql=result.get("sql"),
        results_summary={
            "row_count": len(result.get("rows") or []),
            "total_row_count": result.get("total_row_count"),
            "overflow": result.get("overflow", False),
            "attempt_count": result.get("attempt_count", 1),
            "error": result.get("error"),
            "parent_question": parent_question,
        },
        trace_id=trace_id,
        outcome=_outcome_from(result),
    )
    await tagged.put({"type": "sub_done", "payload": payload})
    return payload


async def _stream_multi(parent_question: str, subquestions: list[str]):
    parent_trace_id, parent_trace, parent_trace_url = _new_trace(parent_question)
    queue: asyncio.Queue = asyncio.Queue()

    async def run_all() -> None:
        try:
            await queue.put({
                "type": "parent_start",
                "parent_question": parent_question,
                "subquestions": subquestions,
                "t": int(time.time() * 1000),
            })

            tasks = [
                _run_sub_streaming(i, sub, parent_trace_id, parent_trace_url, parent_question, queue)
                for i, sub in enumerate(subquestions)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            blocks: list[dict] = []
            for i, (sub, r) in enumerate(zip(subquestions, results)):
                if isinstance(r, Exception):
                    err_block = {
                        "question": sub,
                        "answer": "This part of your request failed unexpectedly.",
                        "error": f"internal error: {r}",
                        "sql": None,
                        "rows": None,
                        "total_row_count": None,
                        "overflow": False,
                        "in_scope": None,
                        "intent_type": None,
                        "attempt_count": 1,
                        "trace_id": parent_trace_id,
                        "trace_url": parent_trace_url,
                        "stage_timings": {},
                        "stage_tokens": {},
                    }
                    blocks.append(err_block)
                    await queue.put({"type": "sub_done", "sub": i, "payload": err_block})
                else:
                    blocks.append(r)

            _flush_trace(parent_trace, {"block_count": len(blocks)})

            await queue.put({
                "type": "done",
                "payload": {
                    "parent_question": parent_question,
                    "block_count": len(blocks),
                    "parent_trace_id": parent_trace_id,
                    "parent_trace_url": parent_trace_url,
                    "blocks": blocks,
                },
            })
        except Exception as exc:
            logger.exception("query_stream multi failed")
            await queue.put({"type": "error", "message": str(exc)})
        finally:
            await queue.put(None)

    asyncio.create_task(run_all())

    async def sse_gen():
        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(jsonable_encoder(event))}\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/query/stream")
async def query_stream(req: QueryRequest):
    subquestions = await decompose(req.question)

    if len(subquestions) > 1:
        return await _stream_multi(req.question, subquestions)

    single_question = subquestions[0]
    trace_id, trace, trace_url = _new_trace(single_question)
    queue: asyncio.Queue = asyncio.Queue()

    async def run_graph() -> None:
        current_event_queue.set(queue)
        try:
            initial_state = {
                "question": single_question,
                "attempt_count": 1,
                "trace_id": trace_id,
            }
            final_state: dict = {}
            async for event in graph().astream_events(initial_state, version="v1"):
                ev_type = event.get("event")
                name = event.get("name")
                if name in KNOWN_NODES:
                    if ev_type == "on_chain_start":
                        await queue.put({
                            "type": "stage_start",
                            "stage": name,
                            "t": int(time.time() * 1000),
                        })
                    elif ev_type == "on_chain_end":
                        await queue.put({
                            "type": "stage_end",
                            "stage": name,
                            "t": int(time.time() * 1000),
                        })
                if ev_type == "on_chain_end":
                    node_output = event.get("data", {}).get("output")
                    if isinstance(node_output, dict):
                        final_state.update(node_output)

            result = final_state

            _flush_trace(trace, {"answer": result.get("answer")})

            payload = {
                "question": single_question,
                "answer": result.get("answer"),
                "sql": result.get("sql"),
                "rows": result.get("rows"),
                "total_row_count": result.get("total_row_count"),
                "overflow": result.get("overflow", False),
                "in_scope": result.get("in_scope"),
                "intent_type": result.get("intent_type"),
                "attempt_count": result.get("attempt_count", 1),
                "trace_id": trace_id,
                "trace_url": trace_url,
                "error": result.get("error"),
                "stage_timings": result.get("stage_timings", {}),
                "stage_tokens": result.get("stage_tokens", {}),
            }

            await chat.save_turn(
                question=single_question,
                sql=result.get("sql"),
                results_summary={
                    "row_count": len(result.get("rows") or []),
                    "total_row_count": result.get("total_row_count"),
                    "overflow": result.get("overflow", False),
                    "attempt_count": result.get("attempt_count", 1),
                    "error": result.get("error"),
                },
                trace_id=trace_id,
                outcome=_outcome_from(result),
            )

            await queue.put({"type": "done", "payload": payload})
        except Exception as exc:
            logger.exception("query_stream failed")
            await queue.put({"type": "error", "message": str(exc)})
        finally:
            await queue.put(None)

    asyncio.create_task(run_graph())

    async def sse_gen():
        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(jsonable_encoder(event))}\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


import json as _json_mod  # noqa: E402
from dataclasses import asdict as _dc_asdict  # noqa: E402
from datetime import datetime as _dt, timezone as _tz  # noqa: E402
from pathlib import Path as _Path  # noqa: E402

_EVAL_LOCK = asyncio.Lock()


@app.post("/eval/run")
async def eval_run():
    """Streams evaluation progress as SSE. One run at a time (lock enforced)."""
    if _EVAL_LOCK.locked():
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'eval already running'})}\n\n"]),
            media_type="text/event-stream",
            status_code=409,
        )

    queue: asyncio.Queue = asyncio.Queue()

    async def run_eval() -> None:
        async with _EVAL_LOCK:
            try:
                from eval.metrics import (
                    execution_accuracy,
                    graceful_handling,
                    guardrail_catch,
                    ragas_faithfulness,
                )

                dataset_dir = _Path("/app/eval/dataset")
                results_dir = _Path("/app/eval/results")
                positive = _json_mod.loads((dataset_dir / "positive.json").read_text())
                negative = _json_mod.loads((dataset_dir / "negative.json").read_text())
                neutral = _json_mod.loads((dataset_dir / "neutral.json").read_text())

                metrics_spec = [
                    ("execution_accuracy", execution_accuracy.run, positive),
                    ("guardrail_catch", guardrail_catch.run, negative),
                    ("graceful_handling", graceful_handling.run, neutral),
                    ("ragas", ragas_faithfulness.run, positive),
                ]

                await queue.put({
                    "type": "eval_start",
                    "metrics": [
                        {"name": name, "total": len(ds)}
                        for name, _, ds in metrics_spec
                    ],
                    "t": int(time.time() * 1000),
                })

                metric_results = []
                for name, fn, ds in metrics_spec:
                    await queue.put({
                        "type": "metric_start",
                        "metric": name,
                        "total": len(ds),
                        "t": int(time.time() * 1000),
                    })

                    async def _on_case(case, metric_name=name):
                        await queue.put({
                            "type": "case_end",
                            "metric": metric_name,
                            "case": _dc_asdict(case),
                            "t": int(time.time() * 1000),
                        })

                    result = await fn(ds, on_case=_on_case)
                    metric_results.append(result)

                    payload_extras = {}
                    if hasattr(result, "faithfulness_mean"):
                        payload_extras["faithfulness_mean"] = result.faithfulness_mean
                        payload_extras["answer_relevancy_mean"] = result.answer_relevancy_mean

                    await queue.put({
                        "type": "metric_end",
                        "metric": name,
                        "passed": result.passed,
                        "total": result.total,
                        "rate": result.rate,
                        **payload_extras,
                        "t": int(time.time() * 1000),
                    })

                out = {
                    "ran_at": _dt.now(_tz.utc).isoformat(),
                    "metrics": [_dc_asdict(r) for r in metric_results],
                }
                results_dir.mkdir(exist_ok=True)
                (results_dir / "latest.json").write_text(_json_mod.dumps(out, indent=2, default=str))

                await queue.put({
                    "type": "eval_end",
                    "results": out,
                    "t": int(time.time() * 1000),
                })
            except Exception as exc:
                logger.exception("eval_run failed")
                await queue.put({"type": "error", "message": str(exc)})
            finally:
                await queue.put(None)

    asyncio.create_task(run_eval())

    async def sse_gen():
        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(jsonable_encoder(event))}\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
