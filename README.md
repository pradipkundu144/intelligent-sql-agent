# Intelligent SQL AI Agent

A natural-language analytics assistant with generation, validation, guardrails, observability, and evaluation.

- **Product spec:** see `../prd/PRD.md`
- **Setup guide:** see `../prd/Setup.md`
- **UI/UX spec:** see `../prd/UIUX.md`
- **Build plan (6 days):** see `../planning/BUILD_PLAN.md`
- **Original brief:** see `../requirements/Original requirement.txt`

## Quick start (once Day 2 lands)

```bash
cp .env.example .env      # then paste your LLM_API_KEY
docker compose up
```

Open http://localhost:5173.

## Repo layout

```
sql-agent/
├── db/                      # schema + seed
├── backend/                 # FastAPI + LangGraph agent
│   └── app/
│       ├── agent/           # 5-stage pipeline (LangGraph)
│       ├── guardrails/      # sqlglot AST checks
│       ├── rag/             # pgvector few-shot retrieval
│       ├── observability/   # Langfuse SDK wrapper
│       └── adk/             # optional stretch (Google ADK port)
├── frontend/                # React + Vite + Tailwind
└── eval/                    # RAGAS + custom eval harness
```
