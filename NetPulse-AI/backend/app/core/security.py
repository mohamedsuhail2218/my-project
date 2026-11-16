"""Password hashing, JWT access tokens and role checks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("netpulse-dummy-password-never-used")
ROLE_LEVELS = {"viewer": 10, "analyst": 20, "admin": 30}


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > 256:
        raise ValueError("Password is too long")
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hash.verify(plain_password, hashed_password)
    except Exception:
        return False


def verify_dummy_password(plain_password: str) -> None:
    """Equalise login timing for unknown email addresses."""
    password_hash.verify(plain_password, DUMMY_HASH)


def create_access_token(subject: str, role: str, extra: dict[str, Any] | None = None) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "iss": "netpulse-ai",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm), expires


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        issuer="netpulse-ai",
        options={"require": ["exp", "iat", "sub"]},
    )


def role_at_least(role: str, required: str) -> bool:
    return ROLE_LEVELS.get(role, 0) >= ROLE_LEVELS.get(required, 99)
