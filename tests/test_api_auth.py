"""Tests for auth mock endpoints.

Phase 2 mock: /auth/send-code always succeeds, /auth/verify always returns a
valid JWT for the dev user. No DB required — auth endpoints are stateless mocks.
"""

import uuid

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from src.backend.main import app

# ---------------------------------------------------------------------------
# /auth/send-code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_code_returns_sent_true():
    """Happy path: any email returns {"sent": true}."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/send-code", json={"email": "test@example.com"})
    assert resp.status_code == 200
    assert resp.json() == {"sent": True}


@pytest.mark.asyncio
async def test_send_code_missing_email_422():
    """Missing required field returns 422 Unprocessable Entity."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/send-code", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_send_code_empty_body_422():
    """Empty body (no JSON at all) returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/send-code", content=b"")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_send_code_any_email_succeeds():
    """Mock accepts any well-formed email string."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/send-code", json={"email": "nobody@nowhere.example"})
    assert resp.status_code == 200
    assert resp.json()["sent"] is True


# ---------------------------------------------------------------------------
# /auth/verify
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_returns_token_and_user_id():
    """Happy path: response contains token and user_id keys."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "123456"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "user_id" in data


@pytest.mark.asyncio
async def test_verify_user_id_is_dev_uuid():
    """user_id must be the hardcoded dev UUID so DB-seeded user works."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "123456"})
    data = resp.json()
    assert data["user_id"] == "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_verify_user_id_is_valid_uuid_string():
    """user_id must be parseable as a UUID."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "000000"})
    data = resp.json()
    # Should not raise ValueError
    uuid.UUID(data["user_id"])


@pytest.mark.asyncio
async def test_verify_token_is_valid_jwt():
    """Token must be a valid JWT decodable with the dev secret."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "000000"})
    data = resp.json()
    from src.backend.auth import get_jwt_secret
    secret = get_jwt_secret() or "dev-secret"
    payload = jwt.decode(data["token"], secret, algorithms=["HS256"])
    assert payload["sub"] == data["user_id"]


@pytest.mark.asyncio
async def test_verify_jwt_has_exp_claim():
    """JWT must include an expiry claim (24 h from issue)."""
    import time

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "000000"})
    data = resp.json()
    from src.backend.auth import get_jwt_secret
    secret = get_jwt_secret() or "dev-secret"
    payload = jwt.decode(data["token"], secret, algorithms=["HS256"])
    assert "exp" in payload
    # exp should be roughly 24 h (86400 s) in the future
    now = int(time.time())
    assert payload["exp"] > now + 86000  # a bit under 24 h tolerance
    assert payload["exp"] < now + 86800  # a bit over 24 h tolerance


@pytest.mark.asyncio
async def test_verify_any_code_succeeds():
    """Mock accepts any code string — no OTP validation in Phase 2."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "wrong-code"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_verify_missing_email_422():
    """Missing email field returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"code": "123456"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_verify_missing_code_422():
    """Missing code field returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", json={"email": "test@example.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_verify_empty_body_422():
    """Empty body returns 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/verify", content=b"")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Dev-mode guard: prod mode returns 501
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_code_prod_mode_returns_501():
    """In prod mode, /auth/send-code returns 501 (not yet implemented)."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("SGA_AUTH_MODE", "prod")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/send-code", json={"email": "test@example.com"})
    assert resp.status_code == 501
    assert "not yet implemented" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_prod_mode_returns_501():
    """In prod mode, /auth/verify returns 501 (not yet implemented)."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("SGA_AUTH_MODE", "prod")
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/verify", json={"email": "test@example.com", "code": "123456"})
    assert resp.status_code == 501
    assert "not yet implemented" in resp.json()["detail"].lower()
