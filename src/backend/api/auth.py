"""Auth endpoints — Phase 2 mock (always succeed).

Production swap: replace the body of send_code to call an email provider and
store a short-lived OTP; replace verify to validate that OTP against the store.
The API shape (request/response types and URL paths) stays unchanged.
"""

import time

import jwt
from contracts.api_types import (
    SendCodeRequest,
    SendCodeResponse,
    VerifyRequest,
    VerifyResponse,
)
from fastapi import APIRouter, HTTPException
from src.backend.auth import DEV_USER_ID, JWT_ALGORITHM, get_jwt_secret, is_dev_mode

router = APIRouter(prefix="/auth", tags=["auth"])

_DEV_USER_STR = str(DEV_USER_ID)


@router.post("/send-code")
async def send_code(body: SendCodeRequest) -> SendCodeResponse:
    """Phase 2 mock: always report that the code was sent."""
    if not is_dev_mode():
        raise HTTPException(status_code=501, detail="Real auth not yet implemented")
    return SendCodeResponse(sent=True)


@router.post("/verify")
async def verify(body: VerifyRequest) -> VerifyResponse:
    """Phase 2 mock: accept any code and return a JWT for the dev user."""
    if not is_dev_mode():
        raise HTTPException(status_code=501, detail="Real auth not yet implemented")
    secret = get_jwt_secret() or "dev-secret"  # dev mode only — guarded above
    token = jwt.encode(
        {"sub": _DEV_USER_STR, "exp": int(time.time()) + 86400},
        secret,
        algorithm=JWT_ALGORITHM,
    )
    return VerifyResponse(token=token, user_id=_DEV_USER_STR)
