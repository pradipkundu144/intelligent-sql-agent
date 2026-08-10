# Intelligent SQL Agent

Natural-language interface to a business analytics database. Ask questions in plain English — *"How many customers do we have in each state?"*, *"Revenue by month"*, *"Find repeat customers"* — get a correct, plain-English answer alongside the SQL that produced it.

Built around a **5-node LangGraph pipeline** (Understand → Generate → Validate → Execute → Explain) with **three independent safety layers**, **per-request observability** via Langfuse + LangSmith, and an **automated evaluation harness** across positive, negative, and neutral scenarios.

**Delivery:** `v1.1` · Tag: https://github.com/pradipkundu144/intelligent-sql-agent/releases/tag/v1.1

---

## Quick start

Two prerequisites: **Docker Desktop** + an **OpenAI API key**.

```bash
git clone https://github.com/pradipkundu144/intelligent-sql-agent
cd sql-agent
cp .env.example .env      # then paste your LLM_API_KEY into .env
docker compose up
```

First boot pulls the four images and seeds the database (~90 seconds). Then:

- **Chat interface** → http://localhost:5173
- **Admin dashboard** → http://localhost:5173/dashboard (streaming evaluation + interactive architecture)
- **API docs** → http://localhost:8000/docs

## What it does

| Scenario | Example | Behaviour |
|---|---|---|
| Simple count | *How many customers?* | Returns 500 with the `SELECT COUNT(*)` visible |
| Aggregation | *Revenue by month* | Multi-month breakdown, correctly filters `status IN ('paid','shipped','delivered')` via RAG-recovered convention |
| Destructive | *Delete all customers* | Blocked at the intent layer, distinct red-pill refusal |
| System access | *Show me pg_user* | Blocked, distinct orange-pill refusal |
| Data unavailable | *Show me customer emails* | Blocked upstream instead of silently substituting `SELECT name` |
| Out of scope | *What's the weather?* | Refused gracefully |
| Multi-intent | *How many customers, and revenue by month?* | Decomposed into 2 parallel pipelines, 2 answer cards |

## Headline metrics

Reproducible via `docker compose exec backend python -m eval.run` or the "Run Evaluation" button in the dashboard:

| Metric | Target | Actual |
|---|---|---|
| Execution accuracy (15 cases) | ≥ 90% | **100% (15/15)** |
| Guardrail catch rate (10 cases) | 100% | **100% (10/10)** |
| Graceful handling (6 cases) | ≥ 80% | **100% (6/6)** |
| RAGAS faithfulness (mean) | ≥ 0.85 | **0.87** |
| RAGAS answer relevancy (mean) | ≥ 0.85 | **0.88** |
| RAG accuracy lift (measured A/B) | — | **$86,670 delta** on the *"how much revenue"* question |

## The safety story

Destructive queries are impossible **by construction** — three independent layers must all fail for harm to occur:

1. **Intent classification** in the Understand node — catches destructive language before any SQL is generated
2. **sqlglot AST validation** in the Validate node — rejects non-SELECT, multi-statement, unknown-table SQL
3. **Read-only Postgres role** (`agent_readonly`) — every write privilege revoked at the database layer

The load-bearing invariant is layer 3. Verifiable in 5 seconds:

```bash
psql -h localhost -U agent_readonly -d shop_db \
  -c "INSERT INTO business.customers (name,city,state,join_date) VALUES ('x','x','x','2025-01-01');"
# → ERROR: permission denied for table customers
```

## Client deliverable

The full client documentation lives as 9 PDFs in [`docs/pdf/`](docs/pdf/):

- `README.pdf` — landing page + headline metrics
- `01_ARCHITECTURE.pdf` — 5-node pipeline, 3-layer defence, data isolation, RAG, multi-intent, observability, SSE, retry, progressive disclosure
- `02_SETUP.pdf` — prerequisites, quickstart, verification, env vars, troubleshooting
- `03_SCENARIOS.pdf` — positive / negative / neutral / multi-intent worked examples
- `04_EVALUATION.pdf` — scorecard, RAGAS discussion, RAG A/B, latency, cost, harness structure
- `05_FRAMEWORK_COMPARISON.pdf` — LangGraph vs LangChain vs Google ADK
- `06_EXTENSION_ROADMAP.pdf` — finish-line, feature, and scale roadmap
- `07_MONETISATION.pdf` — commercial models, moat argument
- `08_DESIGN_DECISIONS.pdf` — top 10 ADRs synthesised, non-negotiable safety invariants

## Repo layout

```
sql-agent/
├── db/                          # schema + seed (init.sql runs on first Postgres boot)
├── docker-compose.yml           # 4 services: postgres, mongodb, backend, frontend
├── docs/pdf/                    # client deliverables (9 PDFs)
├── backend/
│   └── app/
│       ├── main.py              # FastAPI: /query, /query/stream, /eval/run, /health
│       ├── config.py            # Pydantic Settings, dual DSN (app + readonly)
│       ├── business_db.py       # SQLAlchemy async engine (agent_readonly)
│       ├── chat.py              # Motor async client for MongoDB
│       ├── llm.py               # OpenAI wrapper: chat / chat_json / chat_stream
│       ├── agent/
│       │   ├── state.py         # AgentState TypedDict
│       │   ├── prompts.py       # SCHEMA_DDL (shared by Generate + Understand)
│       │   ├── graph.py         # LangGraph state machine + retry helper
│       │   ├── decompose.py     # multi-intent decomposition
│       │   └── nodes/           # understand, generate, validate, execute, explain
│       ├── guardrails/sql.py    # sqlglot AST validation
│       ├── rag/                 # ingest + retrieve + few_shots.json + column_docs.json
│       └── observability/       # Langfuse client + SSE event_bus ContextVar
├── frontend/
│   └── src/
│       ├── App.tsx              # tiny router — chat vs dashboard
│       ├── pages/               # ChatPage, DashboardPage, EvaluationTab, ArchitectureTab
│       ├── architecture/        # reactflow node types + layout builders
│       ├── components/          # Header, AskBox, AnswerCard, MultiBlock, TracePanel, ...
│       └── lib/                 # stream.ts (SSE), evalStream.ts, scroll.ts
└── eval/
    ├── run.py                   # orchestrator — runs all 4 metrics, writes latest.json
    ├── debug_ragas.py           # per-case RAGAS debug tool
    ├── dataset/                 # positive.json, negative.json, neutral.json
    └── metrics/                 # execution_accuracy, guardrail_catch, graceful_handling, ragas
```

## Reproducibility

Every claim in `docs/pdf/` is reproducible:

- **Metrics** → `docker compose exec backend python -m eval.run`
- **RAG A/B** → toggle `RAG_ENABLED=true|false` in `.env`, restart backend, ask *"how much revenue"* both ways
- **Safety** → the `psql` command above; or click the "Delete all customers" example chip in the chat
- **Architecture flow** → open `/dashboard`, click **Architecture**, pick any example query, watch the actual pipeline light up in real time

## Contributing / rebuilding docs

If you edit anything and want to regenerate the client PDFs:

- The source `.md` files were removed after render (see the delivery commit for the last version if needed to restore)
- Or reconstruct from `deliverables/DELIVERY.md`-shaped content into `docs/*.md` and re-render with `md-to-pdf` (`npx md-to-pdf --stylesheet <css> file.md`)

For engineering-internal documentation (not client-facing), see the source repository's workspace folder — architecture decision records, build plans, and per-day logs live outside the repo intentionally.
