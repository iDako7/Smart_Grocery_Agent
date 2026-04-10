"""SGA V2 — FastAPI backend entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.backend.api.saved import router as saved_router
from src.backend.api.sessions import router as sessions_router

logger = logging.getLogger(__name__)


def _check_config() -> None:
    if os.environ.get("SGA_AUTH_MODE", "dev") == "dev":
        logger.warning(
            "SGA_AUTH_MODE is 'dev' — authentication is DISABLED. "
            "Set SGA_AUTH_MODE=prod for production deployments."
        )
    else:
        jwt_secret = os.getenv("JWT_SECRET", "")
        if not jwt_secret or jwt_secret == "change-me-in-production":
            raise RuntimeError("JWT_SECRET must be set to a real secret (not the default placeholder)")

    if not os.environ.get("OPENROUTER_API_KEY"):
        if os.environ.get("SGA_AUTH_MODE", "dev") == "dev":
            logger.warning("OPENROUTER_API_KEY is not set — agent calls will fail.")
        else:
            raise RuntimeError("OPENROUTER_API_KEY must be set")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _check_config()
    yield


app = FastAPI(title="Smart Grocery Assistant V2", version="0.1.0", lifespan=_lifespan)

app.include_router(sessions_router)
app.include_router(saved_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
