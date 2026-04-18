"""Env-gated static-file mount for the bundled frontend.

Gated by `SERVE_FRONTEND=true` at app-startup time so local `bun run dev`
HMR is unaffected. When enabled, the FastAPI app serves `/app/static`
(the built SPA) at `/` and falls back to `index.html` for client-side
routes. API routes keep their root prefixes (`/health`, `/session`,
`/auth`, `/saved`, `/recipe`, `/internal`) and are excluded from the
SPA fallback so a real 404 is returned instead of the shell.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

API_PATH_PREFIXES: tuple[str, ...] = (
    "/health",
    "/session",
    "/auth",
    "/saved",
    "/recipe",
    "/internal",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _is_api_path(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in API_PATH_PREFIXES)


def mount_frontend(app: FastAPI, static_dir: str | Path) -> None:
    """Mount the built SPA at `/` with an SPA fallback route.

    The fallback returns `index.html` for any non-API path, so client-side
    routing (React Router, etc.) works on hard reloads. API paths hit the
    real handlers and return 404 if unmatched.
    """
    static_path = Path(static_dir)
    index_path = static_path / "index.html"

    resolved_static = static_path.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request) -> FileResponse:
        path = "/" + full_path
        if _is_api_path(path):
            raise HTTPException(status_code=404)
        candidate = (static_path / full_path).resolve()
        # Directory-traversal guard: candidate must live under static_path.
        if not candidate.is_relative_to(resolved_static):
            raise HTTPException(status_code=404)
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        if not index_path.is_file():
            raise HTTPException(status_code=404, detail="SPA index.html missing")
        return FileResponse(index_path)
