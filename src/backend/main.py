"""SGA V2 — FastAPI backend entry point."""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from src.backend.api.auth import router as auth_router
from src.backend.api.grocery import router as grocery_router
from src.backend.api.saved import router as saved_router
from src.backend.api.sessions import router as sessions_router
from starlette.middleware.cors import CORSMiddleware

load_dotenv()

logger = logging.getLogger(__name__)


def _check_config() -> None:
    if os.environ.get("SGA_AUTH_MODE", "dev") == "dev":
        logger.warning(
            "SGA_AUTH_MODE is 'dev' — authentication is DISABLED. Set SGA_AUTH_MODE=prod for production deployments."
        )
        if not os.environ.get("DATABASE_URL"):
            raise RuntimeError(
                "DATABASE_URL must be set in dev mode. Add to .env or export in shell. See .env.example."
            )
    else:
        jwt_secret = os.getenv("JWT_SECRET", "")
        if not jwt_secret or jwt_secret == "change-me-in-production":
            raise RuntimeError("JWT_SECRET must be set to a real secret (not the default placeholder)")
        # TODO(#47 follow-up): validate DATABASE_URL in prod mode too — currently only enforced in dev.

    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError("OPENROUTER_API_KEY must be set. Add it to .env or export it in your shell.")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _check_config()
    yield


app = FastAPI(title="Smart Grocery Assistant V2", version="0.1.0", lifespan=_lifespan)

_CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("SGA_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(sessions_router)
app.include_router(grocery_router)
app.include_router(saved_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
