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


@app.post("/query")
async def query(req: QueryRequest):
    settings = get_settings()
    langfuse_client = get_langfuse()
    trace_id = None
    trace = None
    trace_url = None
    if langfuse_client:
        try:
            trace = langfuse_client.trace(name="query", input={"question": req.question})
            trace_id = trace.id
            if trace_id and settings.langfuse_project_id:
                trace_url = f"{settings.langfuse_host.rstrip('/')}/project/{settings.langfuse_project_id}/traces/{trace_id}"
        except Exception as exc:
            logger.warning("langfuse: trace creation failed: %s", exc)

    result = await graph().ainvoke(
        {"question": req.question, "attempt_count": 1, "trace_id": trace_id}
    )

    if trace:
        try:
            trace.update(output={"answer": result.get("answer")})
        except Exception:
            pass

    if langfuse_client:
        try:
            langfuse_client.flush()
        except Exception:
            pass

    payload = {
        "question": req.question,
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

    intent_type = result.get("intent_type")
    if result.get("error"):
        outcome = "error"
    elif intent_type == "destructive":
        outcome = "blocked"
    elif intent_type == "out_of_scope":
        outcome = "out_of_scope"
    else:
        outcome = "ok"

    await chat.save_turn(
        question=req.question,
        sql=result.get("sql"),
        results_summary={
            "row_count": len(result.get("rows") or []),
            "total_row_count": result.get("total_row_count"),
            "overflow": result.get("overflow", False),
            "attempt_count": result.get("attempt_count", 1),
            "error": result.get("error"),
        },
        trace_id=trace_id,
        outcome=outcome,
    )

    return payload


@app.post("/query/stream")
async def query_stream(req: QueryRequest):
    settings = get_settings()
    langfuse_client = get_langfuse()
    trace_id = None
    trace = None
    trace_url = None
    if langfuse_client:
        try:
            trace = langfuse_client.trace(name="query", input={"question": req.question})
            trace_id = trace.id
            if trace_id and settings.langfuse_project_id:
                trace_url = f"{settings.langfuse_host.rstrip('/')}/project/{settings.langfuse_project_id}/traces/{trace_id}"
        except Exception as exc:
            logger.warning("langfuse: trace creation failed: %s", exc)

    queue: asyncio.Queue = asyncio.Queue()

    async def run_graph() -> None:
        current_event_queue.set(queue)
        try:
            initial_state = {
                "question": req.question,
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

            if trace:
                try:
                    trace.update(output={"answer": result.get("answer")})
                except Exception:
                    pass
            if langfuse_client:
                try:
                    langfuse_client.flush()
                except Exception:
                    pass

            payload = {
                "question": req.question,
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

            intent_type = result.get("intent_type")
            if result.get("error"):
                outcome = "error"
            elif intent_type == "destructive":
                outcome = "blocked"
            elif intent_type == "out_of_scope":
                outcome = "out_of_scope"
            else:
                outcome = "ok"

            await chat.save_turn(
                question=req.question,
                sql=result.get("sql"),
                results_summary={
                    "row_count": len(result.get("rows") or []),
                    "total_row_count": result.get("total_row_count"),
                    "overflow": result.get("overflow", False),
                    "attempt_count": result.get("attempt_count", 1),
                    "error": result.get("error"),
                },
                trace_id=trace_id,
                outcome=outcome,
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
