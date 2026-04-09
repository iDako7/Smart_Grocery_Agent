"""SGA V2 — FastAPI backend entry point."""

import os

from fastapi import FastAPI

app = FastAPI(title="Smart Grocery Assistant V2", version="0.1.0")


@app.on_event("startup")
async def _check_config() -> None:
    jwt_secret = os.getenv("JWT_SECRET", "")
    if not jwt_secret or jwt_secret == "change-me-in-production":
        raise RuntimeError("JWT_SECRET must be set to a real secret (not the default placeholder)")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
