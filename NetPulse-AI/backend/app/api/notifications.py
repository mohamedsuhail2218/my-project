"""Notification centre endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, DbSession
from app.services.notifications import (
    clear_read,
    list_notifications,
    mark_all_read,
    mark_read,
    unread_count,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def notifications(
    db: DbSession,
    _: CurrentUser,
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return list_notifications(db, unread_only=unread_only, limit=limit)


@router.get("/unread-count")
def unread(db: DbSession, _: CurrentUser) -> dict:
    return {"unread": unread_count(db)}


@router.post("/read-all")
def read_all(db: DbSession, _: CurrentUser) -> dict:
    count = mark_all_read(db)
    return {"updated": count, "unread": 0}


@router.delete("/read")
def delete_read(db: DbSession, _: CurrentUser) -> dict:
    return {"deleted": clear_read(db)}


@router.post("/{notification_id}/read")
def read_one(notification_id: int, db: DbSession, _: CurrentUser) -> dict:
    row = mark_read(db, notification_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return row
