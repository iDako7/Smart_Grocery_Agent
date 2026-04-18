# syntax=docker/dockerfile:1.7
# Multi-stage build: frontend SPA + FastAPI backend in one image.
#
# Stage 1 — build the Vite/React SPA with Bun.
# Stage 2 — install backend deps with uv and copy the built SPA to /app/static.
# Runtime — alembic upgrade then uvicorn (exec, so uvicorn becomes PID 1 and
# receives SIGTERM for graceful shutdown). Set SERVE_FRONTEND=true to mount
# /app/static at /; API routes keep their root prefixes (/health, /session, …).
#
# Pinned base tags keep the build reproducible across PRs / CI / deploys.

FROM oven/bun:1.3.12 AS frontend
WORKDIR /app/src/frontend
COPY src/frontend/package.json src/frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY src/frontend/ ./
# Empty VITE_API_BASE makes the SPA call relative URLs (same-origin with the API).
# Exposed as ARG so an intentional override is explicit; ENV carries it into the build.
ARG VITE_API_BASE=""
ENV VITE_API_BASE="${VITE_API_BASE}"
RUN bun run build


FROM python:3.13.1-slim AS backend
COPY --from=ghcr.io/astral-sh/uv:0.5.24 /uv /uvx /usr/local/bin/

WORKDIR /app
ENV PYTHONPATH="/app"
ENV SERVE_FRONTEND="true"

# Python deps first — cache this layer unless lockfiles change.
COPY src/backend/pyproject.toml src/backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Backend source + shared modules + data.
COPY src/backend/ ./src/backend/
COPY src/ai/ ./src/ai/
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
COPY data/ ./data/

# Built SPA from stage 1.
COPY --from=frontend /app/src/frontend/dist/ ./static/

EXPOSE 8000
CMD ["sh", "-c", "uv run alembic -c src/backend/alembic.ini upgrade head && exec uv run uvicorn src.backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
