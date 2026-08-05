# Intelligent SQL AI Agent

A natural-language analytics assistant with generation, validation, guardrails, observability, and evaluation.

- **Product spec:** see `../PRD_Intelligent_SQL_AI_Agent.docx`
- **Setup guide:** see `../Setup_Deployment_Intelligent_SQL_AI_Agent.docx`
- **UI/UX spec:** see `../UIUX_Flow_Intelligent_SQL_AI_Agent.docx`
- **Build plan (6 days):** see `../BUILD_PLAN.md`

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
