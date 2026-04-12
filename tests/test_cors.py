"""Tests for CORS middleware configuration.

Verifies that the FastAPI app correctly handles CORS preflight (OPTIONS) requests:
- Allowed origins receive the Access-Control-Allow-Origin header.
- Unknown origins do NOT receive the Access-Control-Allow-Origin header.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from src.backend.main import app


@pytest.fixture()
def client():
    """Return an AsyncClient backed by the ASGI app (no DB needed for CORS tests)."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_cors_preflight_allowed_origin(client):
    """OPTIONS /session from an allowed origin returns 200 + ACAO header."""
    async with client as c:
        resp = await c.options(
            "/session",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


async def test_cors_preflight_unknown_origin(client):
    """OPTIONS /session from an unknown origin must NOT include ACAO header."""
    async with client as c:
        resp = await c.options(
            "/session",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )

    # The response may be 200 or 400 depending on Starlette version, but the
    # ACAO header must be absent for an unrecognised origin.
    assert "access-control-allow-origin" not in resp.headers
