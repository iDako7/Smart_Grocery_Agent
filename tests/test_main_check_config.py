"""Tests for src.backend.main._check_config — DATABASE_URL validation in dev mode."""

import pytest
from src.backend.main import _check_config


def test_check_config_dev_mode_missing_database_url_raises(monkeypatch):
    monkeypatch.setenv("SGA_AUTH_MODE", "dev")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _check_config()


def test_check_config_dev_mode_database_url_set_ok(monkeypatch):
    monkeypatch.setenv("SGA_AUTH_MODE", "dev")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://sga:sga_dev@localhost:5432/sga")

    # Should not raise
    _check_config()


def test_check_config_dev_mode_empty_database_url_raises(monkeypatch):
    monkeypatch.setenv("SGA_AUTH_MODE", "dev")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("DATABASE_URL", "")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _check_config()
