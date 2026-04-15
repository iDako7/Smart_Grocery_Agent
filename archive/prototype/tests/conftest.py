"""Shared pytest fixtures for SGA V2 prototype tests."""

import prototype.tools.lookup_store_product as _lookup_module
import pytest
from prototype.schema import UserProfile


@pytest.fixture
def default_profile() -> UserProfile:
    """Return a fresh UserProfile with default values for each test."""
    return UserProfile()


@pytest.fixture(autouse=True)
def clear_product_cache():
    """Reset the product cache in lookup_store_product after each test.

    This ensures tests that exercise cache behaviour do not bleed into
    each other and that every test starts from a clean loading state.
    """
    yield
    _lookup_module._product_cache = None


@pytest.fixture
def mock_openai_env(monkeypatch):
    """Set OPENROUTER_API_KEY to a dummy value so OpenAI client can be constructed."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-dummy-key")
