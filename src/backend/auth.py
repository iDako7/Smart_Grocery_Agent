"""Authentication middleware — mock dev mode + JWT validation."""

import os
import uuid

import jwt
from fastapi import Depends, HTTPException, Request


DEV_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
JWT_ALGORITHM = "HS256"


def is_dev_mode() -> bool:
    return os.environ.get("SGA_AUTH_MODE", "dev") == "dev"


def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "")


async def get_current_user_id(request: Request) -> uuid.UUID:
    """FastAPI dependency that returns the authenticated user's UUID.

    In dev mode: returns a hardcoded dev user UUID (no token required).
    In production: decodes and validates a JWT Bearer token.
    """
    if is_dev_mode():
        return DEV_USER_ID

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = auth_header[7:]
    secret = get_jwt_secret()
    if not secret:
        raise HTTPException(status_code=500, detail="JWT_SECRET not configured")

    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim")

    try:
        return uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID in token")
