from typing import TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from .config import get_settings

_client: AsyncOpenAI | None = None
T = TypeVar("T", bound=BaseModel)


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=get_settings().llm_api_key)
    return _client


async def chat(prompt: str, *, model: str | None = None, temperature: float = 0.0) -> str:
    settings = get_settings()
    if settings.llm_provider != "openai":
        raise NotImplementedError(f"provider {settings.llm_provider!r} not wired yet")

    response = await _openai().chat.completions.create(
        model=model or settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


async def chat_json(
    prompt: str,
    schema: type[T],
    *,
    model: str | None = None,
) -> T:
    settings = get_settings()
    if settings.llm_provider != "openai":
        raise NotImplementedError(f"provider {settings.llm_provider!r} not wired yet")

    response = await _openai().beta.chat.completions.parse(
        model=model or settings.llm_model,
        messages=[{"role": "user", "content": prompt}],
        response_format=schema,
        temperature=0.0,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        raise ValueError("LLM returned no parsed content matching the schema")
    return parsed
