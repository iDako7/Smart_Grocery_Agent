"""Pure helper functions for the Redis tool cache (issue #121).

No I/O. No Redis imports. These functions are stable building blocks that
the T3 wrapper calls to build keys and serialize/deserialize cache values.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, get_args, get_origin

from pydantic import BaseModel, TypeAdapter


# ---------------------------------------------------------------------------
# canonical_json
# ---------------------------------------------------------------------------


def canonical_json(value: Any) -> bytes:
    """JSON-encode *value* with sorted keys and compact separators.

    Output is UTF-8 bytes with ``ensure_ascii=False`` so that Chinese (and
    other non-ASCII) characters are stored verbatim rather than \\uXXXX-escaped.
    Callers are responsible for calling ``.model_dump()`` on Pydantic models
    before passing them here.
    """
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# ---------------------------------------------------------------------------
# compute_key
# ---------------------------------------------------------------------------


def compute_key(tool_name: str, args: dict) -> str:
    """Return the Redis cache key for a tool call.

    Format: ``sga:tool:{tool_name}:{sha256_hex}``

    The SHA-256 is computed over :func:`canonical_json` of *args*, which
    guarantees that ``{"a": 1, "b": 2}`` and ``{"b": 2, "a": 1}`` map to
    the same key.
    """
    digest = hashlib.sha256(canonical_json(args)).hexdigest()
    return f"sga:tool:{tool_name}:{digest}"


# ---------------------------------------------------------------------------
# encode_value
# ---------------------------------------------------------------------------


def encode_value(result: Any) -> bytes:
    """Serialize a tool handler return value into a cache-ready bytes envelope.

    Supported shapes and their ``kind`` tag:

    * ``None``            → ``{"kind": "none"}``
    * ``BaseModel``       → ``{"kind": "model", "data": {...}}``
    * ``list[BaseModel]`` → ``{"kind": "list",  "data": [{...}, ...]}``
    * ``dict``            → ``{"kind": "dict",  "data": {...}}``

    Any other shape raises :class:`TypeError` — we prefer a loud failure over
    silent cache corruption.
    """
    if result is None:
        envelope: dict[str, Any] = {"kind": "none"}

    elif isinstance(result, BaseModel):
        envelope = {"kind": "model", "data": result.model_dump(mode="json")}

    elif isinstance(result, list):
        # All items must be BaseModel instances; an empty list is allowed.
        for i, item in enumerate(result):
            if not isinstance(item, BaseModel):
                raise TypeError(
                    f"encode_value: unsupported list item at index {i} — "
                    f"expected BaseModel, got {type(item).__name__}"
                )
        envelope = {"kind": "list", "data": [item.model_dump(mode="json") for item in result]}

    elif isinstance(result, dict):
        envelope = {"kind": "dict", "data": result}

    else:
        raise TypeError(
            f"encode_value: unsupported type {type(result).__name__} — "
            "expected BaseModel, list[BaseModel], dict, or None"
        )

    return json.dumps(envelope, ensure_ascii=False).encode("utf-8")


# ---------------------------------------------------------------------------
# decode_value
# ---------------------------------------------------------------------------


def _is_none_type(t: Any) -> bool:
    """True for ``type(None)``."""
    return t is type(None)


def _unwrap_optional(return_type: Any) -> tuple[Any, bool]:
    """If *return_type* is ``X | None`` or ``Optional[X]``, return ``(X, True)``.

    Otherwise return ``(return_type, False)``.
    """
    origin = get_origin(return_type)
    if origin is not None:
        # Union types (including X | None) have origin == types.UnionType or typing.Union
        import types
        import typing

        if origin in (types.UnionType,) or (hasattr(typing, "Union") and origin is getattr(typing, "Union", None)):
            args = [a for a in get_args(return_type) if not _is_none_type(a)]
            has_none = any(_is_none_type(a) for a in get_args(return_type))
            if has_none and len(args) == 1:
                return args[0], True
    return return_type, False


def _is_list_of_model(return_type: Any) -> bool:
    """True for ``list[SomeBaseModel]``."""
    origin = get_origin(return_type)
    if origin is list:
        args = get_args(return_type)
        if args and isinstance(args[0], type) and issubclass(args[0], BaseModel):
            return True
    return False


def decode_value(data: bytes, return_type: Any) -> Any:
    """Deserialize a bytes envelope produced by :func:`encode_value`.

    ``return_type`` drives which envelope ``kind`` is expected and how to
    validate the ``data`` field.  Uses ``pydantic.TypeAdapter`` for
    heavy-lifting so ``list[X]``, ``X | None``, and plain ``X`` all work
    uniformly.

    Raises:
        ValueError: if the envelope ``kind`` does not match what *return_type*
            implies (e.g. trying to decode a ``"model"`` envelope as a list).
    """
    envelope = json.loads(data.decode("utf-8"))
    kind: str = envelope["kind"]

    # ------------------------------------------------------------------
    # Return None immediately for "none" kind
    # ------------------------------------------------------------------
    if kind == "none":
        return None

    # ------------------------------------------------------------------
    # Normalise return_type: unwrap Optional so we work with the inner type.
    # ------------------------------------------------------------------
    inner_type, _is_optional = _unwrap_optional(return_type)

    # ------------------------------------------------------------------
    # dict return type — no Pydantic, just give back the raw dict.
    # ------------------------------------------------------------------
    if inner_type is dict or inner_type == dict:
        if kind != "dict":
            raise ValueError(
                f"decode_value: kind mismatch — expected 'dict' but got '{kind}'"
            )
        return envelope["data"]

    # ------------------------------------------------------------------
    # list[BaseModel]
    # ------------------------------------------------------------------
    if _is_list_of_model(inner_type):
        if kind != "list":
            raise ValueError(
                f"decode_value: kind mismatch — expected 'list' for {inner_type} but got '{kind}'"
            )
        adapter = TypeAdapter(inner_type)
        return adapter.validate_python(envelope["data"])

    # ------------------------------------------------------------------
    # Single BaseModel subclass
    # ------------------------------------------------------------------
    if isinstance(inner_type, type) and issubclass(inner_type, BaseModel):
        if kind != "model":
            raise ValueError(
                f"decode_value: kind mismatch — expected 'model' for {inner_type.__name__} but got '{kind}'"
            )
        return TypeAdapter(inner_type).validate_python(envelope["data"])

    # ------------------------------------------------------------------
    # Fallback: let TypeAdapter try (handles unusual annotations)
    # ------------------------------------------------------------------
    adapter = TypeAdapter(return_type)
    return adapter.validate_python(envelope.get("data"))
