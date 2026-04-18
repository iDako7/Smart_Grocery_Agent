"""Internal admin endpoints — dev-mode only.

These routes are a developer-experience surface for evals and local smoke tests.
They are hard-gated on ``is_dev_mode()`` and return 404 in prod so the route
appears nonexistent.

Issue #126: the Phase 2 eval suite shares a single dev user, so C1/D1 leaking
dietary restrictions into A1/A3 silently corrupts baselines. The provider
calls ``POST /internal/reset-dev-profile`` before each test case.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncConnection
from src.backend.auth import DEV_USER_ID, is_dev_mode
from src.backend.db.crud import reset_user_profile_to_defaults
from src.backend.db.engine import get_db

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/reset-dev-profile")
async def reset_dev_profile(conn: AsyncConnection = Depends(get_db)) -> dict:
    """Reset the hardcoded dev user's profile row back to schema defaults.

    Dev-mode only. Returns 404 in prod so the surface looks absent.
    Idempotent: safe to call repeatedly and before the dev user is seeded.
    """
    if not is_dev_mode():
        raise HTTPException(status_code=404, detail="Not Found")
    await reset_user_profile_to_defaults(conn, DEV_USER_ID)
    await conn.commit()
    return {"reset": True, "user_id": str(DEV_USER_ID)}
