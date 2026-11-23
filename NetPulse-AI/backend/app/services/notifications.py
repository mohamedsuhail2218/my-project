"""In-app notification centre with de-duplication.

Notifications are written by the intelligence engines after a new finding or
status change. A dedupe key stops the same finding from producing a new alert on
every scan while still allowing a fresh alert after the dedupe window.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.intelligence.common import aware, iso
from app.models import Notification

DEDUPE_WINDOW = timedelta(hours=24)


def notify(
    db: Session,
    *,
    kind: str,
    severity: str,
    title: str,
    message: str,
    path: str = "/",
    dedupe_key: str | None = None,
    metadata: dict | None = None,
) -> Notification | None:
    """Stage a notification. Returns None when an equivalent one already exists."""
    if dedupe_key:
        cutoff = datetime.now(timezone.utc) - DEDUPE_WINDOW
        existing = db.scalar(
            select(Notification)
            .where(
                Notification.dedupe_key == dedupe_key,
                Notification.created_at >= cutoff,
            )
            .order_by(Notification.created_at.desc())
            .limit(1)
        )
        if existing is not None:
            existing.message = message
            existing.severity = severity
            existing.title = title
            existing.path = path
            return None
    row = Notification(
        kind=kind,
        severity=severity,
        title=title,
        message=message,
        path=path,
        dedupe_key=dedupe_key,
        metadata_json=metadata or {},
        is_read=False,
    )
    db.add(row)
    db.flush()
    return row


def _serialise(row: Notification) -> dict:
    return {
        "id": row.id,
        "kind": row.kind,
        "severity": row.severity,
        "title": row.title,
        "message": row.message,
        "path": row.path,
        "metadata": row.metadata_json or {},
        "is_read": row.is_read,
        "created_at": iso(row.created_at),
        "age_seconds": max(
            0,
            int((datetime.now(timezone.utc) - aware(row.created_at)).total_seconds()),
        )
        if row.created_at
        else None,
    }


def unread_count(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(Notification.id)).where(Notification.is_read.is_(False))
        )
        or 0
    )


def list_notifications(db: Session, *, unread_only: bool = False, limit: int = 50) -> dict:
    query = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    rows = list(db.scalars(query).all())
    unread = unread_count(db)
    severity_rows = db.execute(
        select(Notification.severity, func.count(Notification.id))
        .where(Notification.is_read.is_(False))
        .group_by(Notification.severity)
    ).all()
    by_severity = {severity: count for severity, count in severity_rows}
    return {
        "notifications": [_serialise(row) for row in rows],
        "unread": unread,
        "by_severity": by_severity,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def mark_read(db: Session, notification_id: int) -> dict | None:
    row = db.get(Notification, notification_id)
    if row is None:
        return None
    row.is_read = True
    db.commit()
    db.refresh(row)
    return _serialise(row)


def mark_all_read(db: Session) -> int:
    rows = db.scalars(select(Notification).where(Notification.is_read.is_(False))).all()
    for row in rows:
        row.is_read = True
    db.commit()
    return len(rows)


def clear_read(db: Session) -> int:
    result = db.execute(delete(Notification).where(Notification.is_read.is_(True)))
    db.commit()
    return int(result.rowcount or 0)
