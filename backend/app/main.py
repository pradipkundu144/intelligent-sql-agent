from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import business_db, chat
from .agent.graph import graph
from .logging_config import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
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
    result = await graph().ainvoke({"question": req.question, "attempt_count": 1})

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
        "error": result.get("error"),
        "stage_timings": result.get("stage_timings", {}),
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
        trace_id=None,
        outcome=outcome,
    )

    return payload
