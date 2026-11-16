"""Authorized local-network device observations and approval workflow."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.deps import AdminUser, AnalystUser, CurrentUser, DbSession
from app.models import Device, DeviceActivity
from app.monitoring.devices import discover_devices
from app.schemas.schemas import DeviceDiscoveryResult, DeviceOut, DeviceUpdate
from app.services.settings import get_setting

router = APIRouter(prefix="/devices", tags=["Devices"])


def _enrich(device: Device) -> dict:
    data = DeviceOut.model_validate(device).model_dump()
    data["status"] = "approved" if device.is_approved else "unrecognized"
    data["id"] = device.id
    return data


@router.get("")
def list_devices(
    db: DbSession,
    _: CurrentUser,
    approval: str | None = Query(default=None, pattern="^(approved|unrecognized)$"),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=250, ge=1, le=1000),
) -> dict:
    query = select(Device)
    if approval == "approved":
        query = query.where(Device.is_approved.is_(True))
    elif approval == "unrecognized":
        query = query.where(Device.is_approved.is_(False))
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            Device.display_name.ilike(needle)
            | Device.ip_address.ilike(needle)
            | Device.hostname.ilike(needle)
        )
    devices = db.scalars(query.order_by(Device.is_approved.asc(), Device.last_seen_at.desc()).limit(limit)).all()
    approved = db.scalar(select(func.count(Device.id)).where(Device.is_approved.is_(True))) or 0
    unrecognized = db.scalar(select(func.count(Device.id)).where(Device.is_approved.is_(False))) or 0
    return {
        "devices": [_enrich(device) for device in devices],
        "summary": {
            "total": approved + unrecognized,
            "approved": approved,
            "unrecognized": unrecognized,
        },
        "privacy_note": (
            "Discovery reads only the operating system's existing ARP cache for local subnets. "
            "No active scans or packet capture are performed. MAC addresses are hashed and masked."
        ),
    }


@router.post("/discover", response_model=DeviceDiscoveryResult)
def discover(db: DbSession, _: AnalystUser) -> DeviceDiscoveryResult:
    if not bool(get_setting(db, "device_discovery_enabled", True)):
        raise HTTPException(status_code=403, detail="Device discovery is disabled in Settings")
    result = discover_devices(db)
    return DeviceDiscoveryResult(
        discovered=result["discovered"],
        new_devices=result["new_devices"],
        duplicates_ignored=result["duplicates_ignored"],
        method=result["method"],
        message=result["message"],
        devices=[DeviceOut.model_validate(device) for device in result["devices"]],
    )


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int, payload: DeviceUpdate, db: DbSession, user: AdminUser
) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    updates = payload.model_dump(exclude_unset=True)
    if "is_approved" in updates:
        device.is_approved = bool(updates["is_approved"])
        device.approved_by = user.id if device.is_approved else None
    if "display_name" in updates:
        device.display_name = updates["display_name"]
    if "notes" in updates:
        device.notes = updates["notes"]
    db.commit()
    db.refresh(device)
    return device


@router.post("/{device_id}/approve", response_model=DeviceOut)
def approve_device(device_id: int, db: DbSession, user: AdminUser) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    device.is_approved = True
    device.approved_by = user.id
    db.commit()
    db.refresh(device)
    return device


@router.get("/{device_id}/activity")
def device_activity(device_id: int, db: DbSession, _: CurrentUser) -> dict:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    activities = db.scalars(
        select(DeviceActivity)
        .where(DeviceActivity.device_id == device_id)
        .order_by(DeviceActivity.seen_at.desc())
        .limit(100)
    ).all()
    return {
        "device": _enrich(device),
        "activities": [
            {"id": row.id, "ip_address": row.ip_address, "seen_at": row.seen_at.isoformat()}
            for row in activities
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
