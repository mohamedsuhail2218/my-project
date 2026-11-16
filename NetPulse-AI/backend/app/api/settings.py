"""Application settings and system status."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core.config import settings
from app.models import AppSetting
from app.schemas.schemas import SettingsOut, SettingsUpdate
from app.services.settings import get_all_settings, update_settings

router = APIRouter(prefix="/settings", tags=["Settings"])


def _serialize(values: dict) -> SettingsOut:
    return SettingsOut(
        latency_threshold_ms=float(values.get("latency_threshold_ms", 150)),
        packet_loss_threshold_pct=float(values.get("packet_loss_threshold_pct", 5)),
        monitoring_interval_seconds=settings.monitoring_interval_seconds,
        monitor_target=settings.monitor_target,
        auto_tickets_enabled=bool(values.get("auto_tickets_enabled", True)),
        auto_anomaly_detection=bool(values.get("auto_anomaly_detection", True)),
        device_discovery_enabled=settings.device_discovery_enabled,
        theme_default=str(values.get("theme_default", "dark")),
        organization_name=str(values.get("organization_name", "NetPulse AI")),
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: DbSession, _: CurrentUser) -> SettingsOut:
    return _serialize(get_all_settings(db))


@router.patch("", response_model=SettingsOut)
def patch_settings(payload: SettingsUpdate, db: DbSession, _: AdminUser) -> SettingsOut:
    values = update_settings(db, payload.model_dump(exclude_unset=True))
    return _serialize(values)


@router.get("/system")
def system_status(db: DbSession, _: CurrentUser) -> dict:
    db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "database": "connected",
        "environment": settings.environment,
        "monitoring_enabled": settings.monitoring_enabled,
        "device_discovery_enabled": settings.device_discovery_enabled,
        "test_runner_enabled": settings.test_runner_enabled,
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "safety": (
            "NetPulse AI performs authorized ICMP probes and reads the local OS ARP cache. "
            "It never scans external networks, captures packets, or reconfigures infrastructure."
        ),
    }
