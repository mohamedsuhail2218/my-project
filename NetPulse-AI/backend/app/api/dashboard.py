"""Dashboard aggregation. Simulated measurements are always excluded."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import fmean

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.ai.anomaly import anomaly_window_summary
from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.intelligence.rollup import intelligence_overview
from app.models import (
    AccessPoint,
    AnomalyEvent,
    Device,
    IssueTicket,
    NetworkMeasurement,
)
from app.monitoring.scheduler import scheduler

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
ACTIVE_TICKET_STATUSES = ("Open", "In Progress")


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


@router.get("/overview")
def overview(
    db: DbSession,
    _: CurrentUser,
    hours: int = Query(default=24, ge=1, le=720),
) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    access_points = db.scalars(select(AccessPoint)).all()
    real_aps = [ap for ap in access_points if not ap.is_simulated]
    simulated_aps = [ap for ap in access_points if ap.is_simulated]
    online_aps = [ap for ap in real_aps if ap.status == "online"]
    offline_aps = [ap for ap in real_aps if ap.status == "offline"]

    measurements = db.scalars(
        select(NetworkMeasurement)
        .where(
            NetworkMeasurement.data_origin == "live",
            NetworkMeasurement.recorded_at >= cutoff,
        )
        .order_by(NetworkMeasurement.recorded_at.asc())
        .limit(2000)
    ).all()
    latest = db.scalar(
        select(NetworkMeasurement)
        .where(NetworkMeasurement.data_origin == "live")
        .order_by(NetworkMeasurement.recorded_at.desc())
        .limit(1)
    )
    total = len(measurements)
    online_count = sum(1 for m in measurements if m.is_online)
    uptime_pct = round(online_count / total * 100, 2) if total else None
    latency_values = [m.latency_ms for m in measurements if m.latency_ms is not None]
    loss_values = [m.packet_loss_pct for m in measurements]
    avg_latency = round(fmean(latency_values), 2) if latency_values else None
    avg_loss = round(fmean(loss_values), 2) if loss_values else None

    ap_health = (
        round(len(online_aps) / len(real_aps) * 100, 2)
        if real_aps and any(ap.last_checked_at for ap in real_aps)
        else None
    )
    health_parts = [value for value in (uptime_pct, ap_health) if value is not None]
    health_pct = round(fmean(health_parts), 2) if health_parts else None

    open_tickets = db.scalars(
        select(IssueTicket).where(IssueTicket.status.in_(ACTIVE_TICKET_STATUSES))
    ).all()
    anomaly_summary = anomaly_window_summary(db, hours=hours)
    known_devices = db.scalar(
        select(func.count(Device.id)).where(Device.is_approved.is_(True))
    ) or 0
    unknown_devices = db.scalar(
        select(func.count(Device.id)).where(Device.is_approved.is_(False))
    ) or 0

    alerts: list[dict] = []
    for event in db.scalars(
        select(AnomalyEvent)
        .where(AnomalyEvent.detected_at >= cutoff)
        .order_by(AnomalyEvent.detected_at.desc())
        .limit(6)
    ).all():
        alerts.append(
            {
                "kind": "ai_anomaly",
                "id": event.id,
                "title": f"AI anomaly · {event.severity}",
                "message": event.explanation[:220],
                "severity": event.severity,
                "created_at": _iso(event.detected_at),
                "path": "/anomalies",
            }
        )
    for ticket in sorted(
        [t for t in open_tickets if t.priority in {"Critical", "High"}],
        key=lambda t: t.created_at,
        reverse=True,
    )[:5]:
        alerts.append(
            {
                "kind": "ticket",
                "id": ticket.id,
                "title": f"{ticket.priority} issue · {ticket.ticket_number}",
                "message": ticket.title,
                "severity": ticket.priority,
                "created_at": _iso(ticket.created_at),
                "path": "/issues",
            }
        )
    for device in db.scalars(
        select(Device)
        .where(Device.is_approved.is_(False))
        .order_by(Device.last_seen_at.desc())
        .limit(4)
    ).all():
        alerts.append(
            {
                "kind": "unknown_device",
                "id": device.id,
                "title": "Unrecognized device observed",
                "message": f"{device.display_name or 'Unapproved device'} at {device.ip_address}",
                "severity": "Medium",
                "created_at": _iso(device.last_seen_at),
                "path": "/devices",
            }
        )
    alerts.sort(key=lambda item: item["created_at"] or "", reverse=True)

    series = [
        {
            "timestamp": _iso(m.recorded_at),
            "latency_ms": m.latency_ms,
            "packet_loss_pct": m.packet_loss_pct,
            "jitter_ms": m.jitter_ms,
            "is_online": m.is_online,
        }
        for m in measurements
    ]

    return {
        "summary": {
            "total_access_points": len(real_aps),
            "online_access_points": len(online_aps),
            "offline_access_points": len(offline_aps),
            "simulated_access_points": len(simulated_aps),
            "network_health_pct": health_pct,
            "average_latency_ms": avg_latency,
            "packet_loss_pct": avg_loss,
            "uptime_pct": uptime_pct,
            "open_issues": len(open_tickets),
            "anomalies": anomaly_summary["total"],
            "known_devices": known_devices,
            "unknown_devices": unknown_devices,
        },
        "latest_measurement": (
            {
                "id": latest.id,
                "latency_ms": latest.latency_ms,
                "packet_loss_pct": latest.packet_loss_pct,
                "jitter_ms": latest.jitter_ms,
                "is_online": latest.is_online,
                "probe_target": latest.probe_target,
                "recorded_at": _iso(latest.recorded_at),
                "data_origin": latest.data_origin,
                "error_message": latest.error_message,
            }
            if latest
            else None
        ),
        "series": series,
        "recent_alerts": alerts[:10],
        "anomaly_breakdown": anomaly_summary,
        "intelligence": intelligence_overview(db),
        "ticket_breakdown": {
            "open": sum(1 for t in open_tickets if t.status == "Open"),
            "in_progress": sum(1 for t in open_tickets if t.status == "In Progress"),
        },
        "monitoring": {
            "enabled": bool(settings.monitoring_enabled),
            "interval_seconds": settings.monitoring_interval_seconds,
            "target": settings.monitor_target,
            "last_cycle_at": _iso(scheduler.last_cycle_at),
            "last_device_scan_at": _iso(scheduler.last_device_scan_at),
            "last_error": scheduler.last_error,
            "method": "Live ICMP probes / read-only local ARP cache",
        },
        "window_hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "All metrics are computed from live local probes. Simulated AP records and "
            "simulated measurements are excluded. AI outputs are statistical observations, "
            "not guaranteed predictions."
        ),
    }
