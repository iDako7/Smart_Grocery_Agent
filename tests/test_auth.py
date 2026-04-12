"""Tests for auth middleware."""

import os
import time
import uuid
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException
from src.backend.auth import get_current_user_id

_TEST_SECRET = "test-secret-key-for-auth-tests"
_DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class _FakeRequest:
    """Minimal request mock with headers."""

    def __init__(self, authorization: str | None = None):
        self.headers = {}
        if authorization is not None:
            self.headers["authorization"] = authorization


async def test_dev_mode_returns_dev_user():
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "dev"}):
        result = await get_current_user_id(_FakeRequest())
    assert result == _DEV_USER_ID


async def test_prod_mode_missing_token():
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "prod", "JWT_SECRET": _TEST_SECRET}):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_id(_FakeRequest())
        assert exc_info.value.status_code == 401


async def test_prod_mode_valid_token():
    user_id = uuid.uuid4()
    token = jwt.encode(
        {"sub": str(user_id), "exp": time.time() + 3600},
        _TEST_SECRET,
        algorithm="HS256",
    )
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "prod", "JWT_SECRET": _TEST_SECRET}):
        result = await get_current_user_id(_FakeRequest(f"Bearer {token}"))
    assert result == user_id


async def test_prod_mode_expired_token():
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": time.time() - 10},
        _TEST_SECRET,
        algorithm="HS256",
    )
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "prod", "JWT_SECRET": _TEST_SECRET}):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_id(_FakeRequest(f"Bearer {token}"))
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()


async def test_prod_mode_bad_signature():
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": time.time() + 3600},
        "wrong-secret",
        algorithm="HS256",
    )
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "prod", "JWT_SECRET": _TEST_SECRET}):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_id(_FakeRequest(f"Bearer {token}"))
        assert exc_info.value.status_code == 401


async def test_prod_mode_missing_sub_claim():
    token = jwt.encode(
        {"exp": time.time() + 3600},
        _TEST_SECRET,
        algorithm="HS256",
    )
    with patch.dict(os.environ, {"SGA_AUTH_MODE": "prod", "JWT_SECRET": _TEST_SECRET}):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_id(_FakeRequest(f"Bearer {token}"))
        assert exc_info.value.status_code == 401
        assert "sub" in exc_info.value.detail.lower()
