"""Authentication and administrator user management."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    hash_password,
    verify_dummy_password,
    verify_password,
)
from app.models import User
from app.schemas.schemas import (
    CreateUserRequest,
    LoginRequest,
    MessageResponse,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

_FAILED_LOGINS: dict[str, list[float]] = {}
_LOGIN_LOCK = threading.Lock()
_MAX_FAILURES = 8
_WINDOW_SECONDS = 300


def _throttle_key(request: Request, email: str) -> str:
    client = request.client.host if request.client else "unknown"
    return f"{client}:{email.lower()}"


def _is_throttled(key: str) -> bool:
    now = time.time()
    with _LOGIN_LOCK:
        attempts = [stamp for stamp in _FAILED_LOGINS.get(key, []) if now - stamp < _WINDOW_SECONDS]
        _FAILED_LOGINS[key] = attempts
        return len(attempts) >= _MAX_FAILURES


def _record_failure(key: str) -> None:
    with _LOGIN_LOCK:
        _FAILED_LOGINS.setdefault(key, []).append(time.time())


def _clear_failures(key: str) -> None:
    with _LOGIN_LOCK:
        _FAILED_LOGINS.pop(key, None)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    throttle_key = _throttle_key(request, email)
    if _is_throttled(throttle_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Wait five minutes and try again.",
        )

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        verify_dummy_password(payload.password)
        _record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(payload.password, user.password_hash):
        _record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled")

    _clear_failures(throttle_key)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    token, expires_at = create_access_token(
        str(user.id), user.role, {"email": user.email, "name": user.full_name}
    )
    return TokenResponse(access_token=token, expires_at=expires_at, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/logout", response_model=MessageResponse)
def logout(_: CurrentUser) -> MessageResponse:
    # Stateless JWT: the browser discards the token. Server-side revocation could
    # be added with a token denylist for multi-instance deployments.
    return MessageResponse(message="Signed out")


@router.get("/users", response_model=list[UserOut])
def list_users(_: AdminUser, db: DbSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)).all())


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: CreateUserRequest, _: AdminUser, db: DbSession) -> User:
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="A user with that email already exists")
    if db.scalar(select(func.count(User.id))) is None:
        raise HTTPException(status_code=500, detail="User database unavailable")
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
