"""SGA V2 — FastAPI backend entry point."""

from fastapi import FastAPI

app = FastAPI(title="Smart Grocery Assistant V2", version="0.1.0")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
