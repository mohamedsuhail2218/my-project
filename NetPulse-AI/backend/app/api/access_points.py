"""Access point registration, configuration history and availability checks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import fmean

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, AnalystUser, CurrentUser, DbSession
from app.models import AccessPoint, AccessPointHistory, NetworkMeasurement
from app.schemas.schemas import (
    AccessPointCreate,
    AccessPointDetail,
    AccessPointOut,
    AccessPointUpdate,
    MeasurementOut,
    MessageResponse,
)
from app.services.monitoring import check_access_point

router = APIRouter(prefix="/access-points", tags=["Access Points"])


def _add_history(
    db,
    access_point: AccessPoint,
    change_type: str,
    changes: dict,
    user_id: int | None,
) -> None:
    db.add(
        AccessPointHistory(
            access_point_id=access_point.id,
            change_type=change_type,
            changes=changes,
            changed_by=user_id,
            changed_at=datetime.now(timezone.utc),
        )
    )


@router.get("", response_model=list[AccessPointOut])
def list_access_points(
    db: DbSession,
    _: CurrentUser,
    include_simulated: bool = Query(default=True),
    search: str | None = Query(default=None, max_length=120),
) -> list[AccessPoint]:
    query = select(AccessPoint)
    if not include_simulated:
        query = query.where(AccessPoint.is_simulated.is_(False))
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            AccessPoint.name.ilike(needle)
            | AccessPoint.location.ilike(needle)
            | AccessPoint.ip_address.ilike(needle)
        )
    return list(db.scalars(query.order_by(AccessPoint.is_simulated.asc(), AccessPoint.name.asc())).all())


@router.get("/{access_point_id}", response_model=AccessPointDetail)
def get_access_point(access_point_id: int, db: DbSession, _: CurrentUser) -> AccessPoint:
    ap = db.get(AccessPoint, access_point_id)
    if ap is None:
        raise HTTPException(status_code=404, detail="Access point not found")
    return ap


@router.post("", response_model=AccessPointOut, status_code=status.HTTP_201_CREATED)
def create_access_point(
    payload: AccessPointCreate, db: DbSession, user: AdminUser
) -> AccessPoint:
    ap = AccessPoint(
        **payload.model_dump(),
        status="simulated" if payload.is_simulated else "unknown",
        created_by=user.id,
    )
    db.add(ap)
    try:
        db.flush()
        _add_history(
            db,
            ap,
            "created",
            {"name": ap.name, "ip_address": ap.ip_address, "is_simulated": ap.is_simulated},
            user.id,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="An access point with this name and IP already exists"
        ) from None
    db.refresh(ap)
    return ap


@router.patch("/{access_point_id}", response_model=AccessPointOut)
def update_access_point(
    access_point_id: int, payload: AccessPointUpdate, db: DbSession, user: AdminUser
) -> AccessPoint:
    ap = db.get(AccessPoint, access_point_id)
    if ap is None:
        raise HTTPException(status_code=404, detail="Access point not found")
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return ap
    changes: dict = {}
    for field, new_value in updates.items():
        old_value = getattr(ap, field)
        if old_value != new_value:
            changes[field] = {"from": old_value, "to": new_value}
            setattr(ap, field, new_value)
    if "is_simulated" in updates:
        ap.status = "simulated" if ap.is_simulated else "unknown"
    _add_history(db, ap, "updated", changes, user.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Another access point uses this name and IP"
        ) from None
    db.refresh(ap)
    return ap


@router.delete("/{access_point_id}", response_model=MessageResponse)
def delete_access_point(access_point_id: int, db: DbSession, _: AdminUser) -> MessageResponse:
    ap = db.get(AccessPoint, access_point_id)
    if ap is None:
        raise HTTPException(status_code=404, detail="Access point not found")
    db.delete(ap)
    db.commit()
    return MessageResponse(message="Access point and its measurement history were deleted")


@router.post("/{access_point_id}/check")
def check_now(access_point_id: int, db: DbSession, _: AnalystUser) -> dict:
    ap = db.get(AccessPoint, access_point_id)
    if ap is None:
        raise HTTPException(status_code=404, detail="Access point not found")
    measurement = check_access_point(db, ap)
    db.refresh(ap)
    return {
        "message": (
            f"{ap.name}: simulated availability check (clearly labelled, excluded from live health)."
            if ap.is_simulated
            else f"{ap.name}: {'online' if measurement.is_online else 'offline'} ({measurement.packet_loss_pct:.1f}% loss)"
        ),
        "measurement": MeasurementOut.model_validate(measurement),
        "access_point": AccessPointOut.model_validate(ap),
        "is_simulated": ap.is_simulated,
    }


@router.get("/{access_point_id}/performance")
def access_point_performance(
    access_point_id: int,
    db: DbSession,
    _: CurrentUser,
    hours: int = Query(default=24, ge=1, le=720),
) -> dict:
    ap = db.get(AccessPoint, access_point_id)
    if ap is None:
        raise HTTPException(status_code=404, detail="Access point not found")
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    measurements = db.scalars(
        select(NetworkMeasurement)
        .where(
            NetworkMeasurement.access_point_id == access_point_id,
            NetworkMeasurement.recorded_at >= cutoff,
        )
        .order_by(NetworkMeasurement.recorded_at.asc())
    ).all()
    latencies = [m.latency_ms for m in measurements if m.latency_ms is not None]
    if not measurements:
        return {
            "hours": hours,
            "measurements": 0,
            "uptime_pct": None,
            "average_latency_ms": None,
            "average_packet_loss_pct": None,
            "latest": None,
            "simulated": ap.is_simulated,
        }
    latest = measurements[-1]
    return {
        "hours": hours,
        "measurements": len(measurements),
        "uptime_pct": round(sum(1 for m in measurements if m.is_online) / len(measurements) * 100, 2),
        "average_latency_ms": round(fmean(latencies), 2) if latencies else None,
        "average_packet_loss_pct": round(fmean([m.packet_loss_pct for m in measurements]), 2),
        "latest": MeasurementOut.model_validate(latest),
        "simulated": ap.is_simulated,
        "points": [
            {
                "timestamp": m.recorded_at.isoformat(),
                "latency_ms": m.latency_ms,
                "packet_loss_pct": m.packet_loss_pct,
                "is_online": m.is_online,
                "data_origin": m.data_origin,
            }
            for m in measurements
        ],
    }
