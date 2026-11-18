"""Runtime-configurable thresholds stored in the database."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AppSetting

DEFAULT_SETTINGS: dict[str, object] = {
    "latency_threshold_ms": settings.latency_threshold_ms,
    "packet_loss_threshold_pct": settings.packet_loss_threshold_pct,
    "auto_tickets_enabled": settings.auto_tickets_enabled,
    "auto_anomaly_detection": settings.auto_anomaly_detection,
    "theme_default": "dark",
    "organization_name": "NetPulse AI",
}


def ensure_default_settings(db: Session) -> None:
    """Stage missing defaults on the caller's transaction.

    Flushing rather than committing lets first-run seeding add settings, the
    administrator and demo access points atomically under the startup lock.
    """
    existing = {row.key for row in db.scalars(select(AppSetting)).all()}
    for key, value in DEFAULT_SETTINGS.items():
        if key not in existing:
            db.add(AppSetting(key=key, value=value))
    db.flush()


def get_all_settings(db: Session) -> dict[str, object]:
    rows = db.scalars(select(AppSetting)).all()
    return {**DEFAULT_SETTINGS, **{row.key: row.value for row in rows}}


def get_setting(db: Session, key: str, default: object = None) -> object:
    row = db.scalar(select(AppSetting).where(AppSetting.key == key))
    if row is None:
        return DEFAULT_SETTINGS.get(key, default)
    return row.value


def set_setting(db: Session, key: str, value: object) -> None:
    row = db.scalar(select(AppSetting).where(AppSetting.key == key))
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def update_settings(db: Session, updates: dict[str, object]) -> dict[str, object]:
    allowed = set(DEFAULT_SETTINGS)
    for key, value in updates.items():
        if key in allowed and value is not None:
            set_setting(db, key, value)
    return get_all_settings(db)
