"""Password, JWT and role helper unit tests."""

from __future__ import annotations

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    role_at_least,
    verify_password,
)


def test_password_hash_round_trip():
    hashed = hash_password("A-strong-test-password-123!")
    assert hashed != "A-strong-test-password-123!"
    assert verify_password("A-strong-test-password-123!", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_password_hash_rejects_oversized_input():
    with pytest.raises(ValueError):
        hash_password("x" * 300)


def test_access_token_contains_required_claims():
    token, expires_at = create_access_token(
        "42", "analyst", {"email": "analyst@example.edu"}
    )
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "analyst"
    assert payload["iss"] == "netpulse-ai"
    assert payload["email"] == "analyst@example.edu"
    assert expires_at.tzinfo is not None


def test_token_with_wrong_signature_is_rejected():
    token, _ = create_access_token("1", "admin")
    tampered = token[:-2] + ("aa" if token[-2:] != "aa" else "bb")
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)


def test_role_hierarchy():
    assert role_at_least("admin", "analyst")
    assert role_at_least("analyst", "viewer")
    assert role_at_least("admin", "admin")
    assert not role_at_least("viewer", "analyst")
    assert not role_at_least("unknown", "viewer")


def test_postgres_urls_get_an_explicit_driver():
    from app.core.config import Settings

    for scheme in ("postgres://", "postgresql://"):
        settings = Settings(
            database_url=f"{scheme}user:pass@pooled.db.prisma.io:5432/postgres?sslmode=require"
        )
        assert settings.database_url == (
            "postgresql+psycopg2://user:pass@pooled.db.prisma.io:5432/postgres?sslmode=require"
        )

    explicit = Settings(database_url="postgresql+psycopg://user:pass@db.example.com/app")
    assert explicit.database_url == "postgresql+psycopg://user:pass@db.example.com/app"


def test_production_secret_requirements_are_enforced():
    from app.core.config import Settings

    with pytest.raises(ValueError, match="JWT_SECRET_KEY"):
        Settings(
            environment="production",
            database_url="sqlite:///:memory:",
            jwt_secret_key="",
            admin_password="StrongProductionPass123!",
        )
    with pytest.raises(ValueError, match="ADMIN_PASSWORD"):
        Settings(
            environment="production",
            database_url="sqlite:///:memory:",
            jwt_secret_key="x" * 40,
            admin_password="",
        )


def test_test_environment_has_ephemeral_safe_defaults():
    assert settings.environment == "testing"
    assert settings.database_url.startswith("sqlite:///")
    assert "netpulse-tests" in settings.database_url
    assert len(settings.jwt_secret_key) >= 32
