"""Shared SQL helper utilities for KB tool handlers."""


def _escape_like(value: str) -> str:
    """Escape LIKE special characters to prevent wildcard injection."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
