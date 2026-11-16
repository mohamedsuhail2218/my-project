"""Live network monitoring endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.ai.anomaly import detect_anomalies
from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.core.config import settings
from app.models import NetworkMeasurement
from app.monitoring.diagnostics import network_info
from app.monitoring.scheduler import scheduler
from app.schemas.schemas import (
    MeasurementOut,
    MonitoringHistory,
    MonitoringRunResponse,
    NetworkInfo,
)
from app.services.monitoring import run_network_check
from app.services.settings import get_setting

router = APIRouter(prefix="/monitoring", tags=["Network Monitoring"])


@router.get("/network-info", response_model=NetworkInfo)
def get_network_info(_: CurrentUser):
    return network_info()


@router.get("/history", response_model=MonitoringHistory)
def history(
    db: DbSession,
    _: CurrentUser,
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=500, ge=1, le=5000),
    include_minor_points: bool = Query(default=True),
    access_point_id: int | None = Query(default=None, ge=1),
) -> MonitoringHistory:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = select(NetworkMeasurement).where(NetworkMeasurement.recorded_at >= cutoff)
    if access_point_id is not None:
        query = query.where(NetworkMeasurement.access_point_id == access_point_id)
    else:
        query = query.where(NetworkMeasurement.access_point_id.is_(None))
    if not include_minor_points:
        query = query.where(NetworkMeasurement.data_origin == "live")
    rows = db.scalars(
        query.order_by(NetworkMeasurement.recorded_at.desc()).limit(limit)
    ).all()
    rows = list(reversed(rows))
    return MonitoringHistory(
        measurements=[MeasurementOut.model_validate(row) for row in rows], hours=hours
    )


@router.get("/latest", response_model=MeasurementOut | None)
def latest_measurement(db: DbSession, _: CurrentUser):
    row = db.scalar(
        select(NetworkMeasurement)
        .where(NetworkMeasurement.data_origin == "live")
        .order_by(NetworkMeasurement.recorded_at.desc())
        .limit(1)
    )
    return row


@router.post("/run", response_model=MonitoringRunResponse)
def run_check(db: DbSession, _: AnalystUser) -> MonitoringRunResponse:
    if settings.environment == "testing":
        raise HTTPException(status_code=409, detail="Live probes are disabled in the test environment")
    measurement = run_network_check(db)
    anomaly_message = ""
    if bool(get_setting(db, "auto_anomaly_detection", True)):
        try:
            summary = detect_anomalies(db)
            anomaly_message = f" {summary['anomalies_found']} new AI anomaly event(s)."
        except Exception:
            anomaly_message = " AI analysis could not complete; the live measurement was stored."
    message = (
        f"Live probe completed: {'online' if measurement.is_online else 'no response'}, "
        f"{measurement.latency_ms if measurement.latency_ms is not None else 'n/a'} ms latency, "
        f"{measurement.packet_loss_pct:.1f}% packet loss.{anomaly_message}"
    )
    return MonitoringRunResponse(
        measurement=MeasurementOut.model_validate(measurement),
        message=message,
        latency_threshold_ms=float(get_setting(db, "latency_threshold_ms", 150)),
        packet_loss_threshold_pct=float(get_setting(db, "packet_loss_threshold_pct", 5)),
    )


@router.get("/scheduler")
def scheduler_status(_: CurrentUser) -> dict:
    return {
        "enabled": bool(settings.monitoring_enabled),
        "interval_seconds": settings.monitoring_interval_seconds,
        "target": settings.monitor_target,
        "last_cycle_at": scheduler.last_cycle_at.isoformat() if scheduler.last_cycle_at else None,
        "last_device_scan_at": (
            scheduler.last_device_scan_at.isoformat() if scheduler.last_device_scan_at else None
        ),
        "last_error": scheduler.last_error,
        "note": "Background checks run only while the FastAPI process is running.",
    }
