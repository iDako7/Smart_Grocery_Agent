"""Tests for the env-gated frontend mount (PR 3 / issue #132).

Exercises `mount_frontend` against a fresh FastAPI app so no cross-test
env/import state leaks. The production flow gates the mount on
`SERVE_FRONTEND=true`; these tests bypass the flag by calling the mount
function directly.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.backend.frontend_serve import API_PATH_PREFIXES, mount_frontend


def _build_app_with_static(tmp_path, *, add_fake_api: bool = False) -> FastAPI:
    static_dir = tmp_path / "static"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<!doctype html><html><body>SGA SPA</body></html>")
    assets = static_dir / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('app');")

    app = FastAPI()
    if add_fake_api:

        @app.get("/session")
        async def _session():
            return {"ok": True}

    mount_frontend(app, static_dir)
    return app


def test_root_returns_spa_index(tmp_path):
    """GET / serves index.html content."""
    client = TestClient(_build_app_with_static(tmp_path))
    r = client.get("/")
    assert r.status_code == 200
    assert "SGA SPA" in r.text


def test_static_asset_served_directly(tmp_path):
    """Real files under the static dir are served as-is (not the SPA shell)."""
    client = TestClient(_build_app_with_static(tmp_path))
    r = client.get("/assets/app.js")
    assert r.status_code == 200
    assert "console.log" in r.text


def test_unknown_client_route_falls_back_to_index(tmp_path):
    """Unknown non-API paths (client-side routes) return index.html."""
    client = TestClient(_build_app_with_static(tmp_path))
    r = client.get("/recipes/deep/link")
    assert r.status_code == 200
    assert "SGA SPA" in r.text


def test_api_path_is_not_shadowed_by_spa_fallback(tmp_path):
    """When an API route exists, it handles the request — not the SPA fallback."""
    client = TestClient(_build_app_with_static(tmp_path, add_fake_api=True))
    r = client.get("/session")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_unmatched_api_path_returns_404_not_spa(tmp_path):
    """API prefixes without a matching route return 404 — never the SPA shell.

    `/docs`, `/openapi.json`, `/redoc` have real FastAPI handlers so they
    return 200; the invariant we care about is that none of the API prefixes
    ever serve the SPA shell as a fallback.
    """
    client = TestClient(_build_app_with_static(tmp_path))
    for prefix in API_PATH_PREFIXES:
        r = client.get(prefix)
        assert "SGA SPA" not in r.text, f"{prefix} unexpectedly served the SPA shell"
        if prefix not in ("/docs", "/openapi.json", "/redoc"):
            assert r.status_code == 404, f"{prefix} should 404 without a handler, got {r.status_code}"


def test_nested_api_path_returns_404_not_spa(tmp_path):
    """Nested API paths (`/session/abc`, `/auth/verify`, …) also bypass SPA fallback."""
    client = TestClient(_build_app_with_static(tmp_path))
    for path in ("/session/123", "/auth/verify", "/saved/recipes/1", "/recipe/r-1", "/internal/reset"):
        r = client.get(path)
        assert r.status_code == 404, f"{path} unexpectedly served the SPA (status {r.status_code})"


def test_traversal_outside_static_is_rejected(tmp_path):
    """URL paths that resolve outside the static directory return 404, never leaking a file."""
    # Create a sensitive file one level above static_dir.
    sibling = tmp_path / "secret.txt"
    sibling.write_text("TOP SECRET")

    client = TestClient(_build_app_with_static(tmp_path))
    # `.. /secret.txt` requested as a URL-safe path segment.
    r = client.get("/..%2Fsecret.txt")
    assert r.status_code == 404
    assert "TOP SECRET" not in r.text


def test_all_real_app_routes_have_prefix_in_whitelist():
    """Guard: every backend route registered via include_router must have an
    API_PATH_PREFIXES entry. Without this, adding a new router without updating
    the prefix list silently lets the SPA fallback shadow its routes.
    """
    # Import the full app so we see every include_router'd path.
    from src.backend.main import app as real_app

    # Starlette routes expose their path template as `.path`.
    route_paths: list[str] = []
    for route in real_app.routes:
        path = getattr(route, "path", None)
        if path is None:
            continue
        # Skip built-in FastAPI docs endpoints — they live under /docs, /openapi.json, /redoc
        # which are already in the whitelist.
        route_paths.append(path)

    # Filter out the mount catch-all itself (if the fallback is registered) and
    # path-less routes like "/" that only the SPA fallback handles.
    backend_paths = [p for p in route_paths if p and p != "/" and not p.startswith("/{full_path:path}")]

    unhandled = [
        p
        for p in backend_paths
        if not any(
            p == prefix or p.startswith(prefix + "/") or p.startswith(prefix + "{") for prefix in API_PATH_PREFIXES
        )
    ]
    assert not unhandled, (
        f"Routes not covered by API_PATH_PREFIXES (would be shadowed by SPA fallback): {unhandled}. "
        f"Add the new prefix to src/backend/frontend_serve.py::API_PATH_PREFIXES."
    )
