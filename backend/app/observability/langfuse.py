import logging
from functools import lru_cache

from langfuse import Langfuse

from ..config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_langfuse() -> Langfuse | None:
    settings = get_settings()
    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        logger.info("langfuse: keys not set, tracing disabled")
        return None
    try:
        return Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception as exc:
        logger.warning("langfuse: failed to initialise, tracing disabled: %s", exc)
        return None
