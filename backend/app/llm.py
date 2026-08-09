from typing import AsyncIterator, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from .config import get_settings
from .observability.langfuse import get_langfuse

_client: AsyncOpenAI | None = None
T = TypeVar("T", bound=BaseModel)


def _openai() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=get_settings().llm_api_key)
    return _client


async def chat(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.0,
    trace_id: str | None = None,
    span_name: str = "chat",
    usage_sink: dict | None = None,
) -> str:
    settings = get_settings()
    if settings.llm_provider != "openai":
        raise NotImplementedError(f"provider {settings.llm_provider!r} not wired yet")

    model_name = model or settings.llm_model
    generation = _start_generation(trace_id, span_name, model_name, prompt)

    try:
        response = await _openai().chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        content = response.choices[0].message.content or ""
        _end_generation(generation, output=content, usage=response.usage)
        _record_usage(usage_sink, model_name, response.usage)
        return content
    except Exception:
        _end_generation(generation, level="ERROR")
        raise


async def chat_json(
    prompt: str,
    schema: type[T],
    *,
    model: str | None = None,
    trace_id: str | None = None,
    span_name: str = "chat_json",
    usage_sink: dict | None = None,
) -> T:
    settings = get_settings()
    if settings.llm_provider != "openai":
        raise NotImplementedError(f"provider {settings.llm_provider!r} not wired yet")

    model_name = model or settings.llm_model
    generation = _start_generation(trace_id, span_name, model_name, prompt)

    try:
        response = await _openai().beta.chat.completions.parse(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            response_format=schema,
            temperature=0.0,
        )
        parsed = response.choices[0].message.parsed
        if parsed is None:
            raise ValueError("LLM returned no parsed content matching the schema")
        _end_generation(
            generation,
            output=parsed.model_dump_json(),
            usage=response.usage,
        )
        _record_usage(usage_sink, model_name, response.usage)
        return parsed
    except Exception:
        _end_generation(generation, level="ERROR")
        raise


async def chat_stream(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.0,
    trace_id: str | None = None,
    span_name: str = "chat_stream",
    usage_sink: dict | None = None,
) -> AsyncIterator[str]:
    settings = get_settings()
    if settings.llm_provider != "openai":
        raise NotImplementedError(f"provider {settings.llm_provider!r} not wired yet")

    model_name = model or settings.llm_model
    generation = _start_generation(trace_id, span_name, model_name, prompt)
    accumulated = []

    try:
        stream = await _openai().chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            stream=True,
            stream_options={"include_usage": True},
        )
        final_usage = None
        async for chunk in stream:
            if chunk.usage is not None:
                final_usage = chunk.usage
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                accumulated.append(delta)
                yield delta
        full_output = "".join(accumulated)
        _end_generation(generation, output=full_output, usage=final_usage)
        _record_usage(usage_sink, model_name, final_usage)
    except Exception:
        _end_generation(generation, level="ERROR")
        raise


def _start_generation(
    trace_id: str | None,
    name: str,
    model: str,
    prompt: str,
):
    if not trace_id:
        return None
    client = get_langfuse()
    if client is None:
        return None
    try:
        return client.generation(
            trace_id=trace_id,
            name=name,
            model=model,
            input=prompt,
        )
    except Exception:
        return None


def _end_generation(generation, *, output: str | None = None, usage=None, level: str | None = None) -> None:
    if generation is None:
        return
    try:
        kwargs: dict = {}
        if output is not None:
            kwargs["output"] = output
        if usage is not None:
            kwargs["usage"] = {
                "input": getattr(usage, "prompt_tokens", None),
                "output": getattr(usage, "completion_tokens", None),
            }
        if level is not None:
            kwargs["level"] = level
        generation.end(**kwargs)
    except Exception:
        pass


def _record_usage(sink: dict | None, model: str, usage) -> None:
    if sink is None or usage is None:
        return
    sink["model"] = model
    sink["input"] = getattr(usage, "prompt_tokens", None)
    sink["output"] = getattr(usage, "completion_tokens", None)
