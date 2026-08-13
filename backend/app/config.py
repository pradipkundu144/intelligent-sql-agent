from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "openai"
    llm_api_key: str
    llm_model: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"

    postgres_user: str = "app"
    postgres_password: str = "app"
    postgres_db: str = "shop_db"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    db_readonly_role: str = "agent_readonly"
    db_readonly_password: str = "agent_readonly_pw"

    mongo_uri: str = "mongodb://mongodb:27017/sql_agent"

    safe_inline_limit: int = 250
    hard_row_ceiling: int = 50000
    overflow_sample_size: int = 20
    query_timeout_ms: int = 5000
    max_retries: int = 3
    max_subquestions: int = 5

    rag_enabled: bool = True
    rag_top_k_examples: int = 3
    rag_top_k_column_docs: int = 5

    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"
    langfuse_project_id: str | None = None

    admin_token: str | None = None
    api_token: str | None = None

    cors_origins: str = "http://localhost:5173"

    framework: str = "langgraph"

    @property
    def app_dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def readonly_dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_readonly_role}:{self.db_readonly_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
