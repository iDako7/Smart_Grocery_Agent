"""Read-through Redis cache decorator for async tool handlers (issue #121).

Public API: ``cached_tool(tool_name, ttl_seconds, return_type)`` — a decorator
factory that wraps ``async def handler(db, input: PydanticModel) -> R`` with
a read-through Redis cache.

Runtime behavior on each call:
  1. Build cache key from tool_name + input.model_dump(mode="json").
  2. Get Redis client (None → skip cache, call handler directly).
  3. GET from Redis; on hit return decoded value; on miss fall through.
  4. Call handler.
  5. SET result with ttl_seconds; swallow Redis errors (don't fail the request).
  6. Return result.

Redis exceptions from GET are swallowed (WARN logged); SET exceptions are also
swallowed. Handler exceptions are NOT swallowed.
"""
from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar

import redis.exceptions

from src.ai.cache.client import get_redis_client
from src.ai.cache.keys import compute_key, decode_value, encode_value

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


def cached_tool(
    tool_name: str,
    ttl_seconds: int,
    return_type: Any,
) -> Callable[[F], F]:
    """Decorator that wraps an async tool handler into a read-through Redis cache.

    The handler must have signature::

        async def handler(db, input: PydanticModel) -> R

    where *input* is a Pydantic model instance and *R* is ``BaseModel``,
    ``list[BaseModel]``, or ``BaseModel | None``.
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(db: Any, input: Any) -> Any:  # noqa: A002
            key = compute_key(tool_name, input.model_dump(mode="json"))

            # Step 2: get client
            client = await get_redis_client()
            if client is None:
                logger.debug("cache.skip tool=%s (client unavailable)", tool_name)
                return await func(db, input)

            # Step 3: GET
            # redis.exceptions.RedisError covers all Redis-layer errors;
            # builtin TimeoutError catches asyncio/OS-level timeouts not wrapped by redis-py.
            try:
                raw = await client.get(key)
            except (redis.exceptions.ConnectionError, TimeoutError, redis.exceptions.RedisError) as exc:
                logger.warning("cache.error op=get tool=%s error=%s", tool_name, exc)
                # Do NOT attempt SET after a GET failure
                return await func(db, input)

            if raw is not None:
                try:
                    logger.info("cache.hit tool=%s", tool_name)
                    return decode_value(raw, return_type)
                except Exception as exc:
                    logger.warning("cache.error op=decode tool=%s error=%s", tool_name, exc)
                    # Corrupt/stale entry — fall through to live handler below

            logger.info("cache.miss tool=%s", tool_name)

            # Step 4: call handler
            result = await func(db, input)

            # Step 5: SET (same exception tuple rationale as GET above)
            try:
                await client.set(key, encode_value(result), ex=ttl_seconds)
            except (redis.exceptions.ConnectionError, TimeoutError, redis.exceptions.RedisError) as exc:
                logger.warning("cache.error op=set tool=%s error=%s", tool_name, exc)

            return result

        return wrapper  # type: ignore[return-value]

    return decorator
