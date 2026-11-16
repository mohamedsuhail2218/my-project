"""Ticket automation and duplicate suppression."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AccessPoint, AnomalyEvent, IssueTicket, NetworkMeasurement
from app.services.settings import get_setting

ACTIVE_STATUSES = ("Open", "In Progress")


def _ticket_number() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"NP-{stamp}-{secrets.token_hex(2).upper()}"


def create_ticket(
    db: Session,
    *,
    title: str,
    description: str,
    priority: str,
    issue_type: str,
    fingerprint: str,
    access_point_id: int | None = None,
    anomaly_event_id: int | None = None,
    source: str = "automatic",
) -> tuple[IssueTicket, bool]:
    """Return (ticket, created). Existing active tickets suppress duplicates."""
    existing = db.scalar(
        select(IssueTicket).where(
            IssueTicket.fingerprint == fingerprint,
            IssueTicket.status.in_(ACTIVE_STATUSES),
        )
    )
    if existing:
        return existing, False

    ticket = IssueTicket(
        ticket_number=_ticket_number(),
        title=title[:200],
        description=description,
        priority=priority,
        status="Open",
        issue_type=issue_type,
        fingerprint=fingerprint,
        source=source,
        access_point_id=access_point_id,
        anomaly_event_id=anomaly_event_id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket, True


def evaluate_measurement_ticket(
    db: Session, measurement: NetworkMeasurement
) -> IssueTicket | None:
    if measurement.data_origin != "live":
        return None
    if not bool(get_setting(db, "auto_tickets_enabled", True)):
        return None

    latency_threshold = float(get_setting(db, "latency_threshold_ms", 150))
    loss_threshold = float(get_setting(db, "packet_loss_threshold_pct", 5))
    ap_suffix = f":{measurement.access_point_id}" if measurement.access_point_id else ""

    if not measurement.is_online:
        ticket, created = create_ticket(
            db,
            title="Internet connectivity check failed",
            description=(
                "The live network probe received no replies and recorded 100% loss. "
                f"Target: {measurement.probe_target}. "
                f"Recorded at {measurement.recorded_at.isoformat()}."
            ),
            priority="Critical",
            issue_type="connectivity_down",
            fingerprint=f"connectivity_down{ap_suffix}",
            access_point_id=measurement.access_point_id,
        )
        return ticket if created else None

    if measurement.packet_loss_pct >= loss_threshold:
        priority = "High" if measurement.packet_loss_pct < 20 else "Critical"
        ticket, created = create_ticket(
            db,
            title="Elevated packet loss detected",
            description=(
                f"Live probe measured {measurement.packet_loss_pct:.1f}% packet loss, "
                f"above the {loss_threshold:.1f}% threshold. "
                f"Average latency: {measurement.latency_ms if measurement.latency_ms is not None else 'n/a'} ms."
            ),
            priority=priority,
            issue_type="packet_loss",
            fingerprint=f"packet_loss{ap_suffix}",
            access_point_id=measurement.access_point_id,
        )
        return ticket if created else None

    if measurement.latency_ms is not None and measurement.latency_ms >= latency_threshold:
        ticket, created = create_ticket(
            db,
            title="High network latency detected",
            description=(
                f"Live probe measured {measurement.latency_ms:.1f} ms average latency, "
                f"above the {latency_threshold:.1f} ms threshold."
            ),
            priority="High",
            issue_type="high_latency",
            fingerprint=f"high_latency{ap_suffix}",
            access_point_id=measurement.access_point_id,
        )
        return ticket if created else None
    return None


def evaluate_access_point_ticket(db: Session, access_point: AccessPoint) -> IssueTicket | None:
    if access_point.is_simulated or access_point.status != "offline":
        return None
    if not bool(get_setting(db, "auto_tickets_enabled", True)):
        return None
    ticket, created = create_ticket(
        db,
        title=f"Access point unreachable: {access_point.name}",
        description=(
            f"The registered access point {access_point.name} ({access_point.ip_address}) "
            "did not respond to the availability probe. Check power, cabling and the "
            "authorized management network."
        ),
        priority="High",
        issue_type="ap_unavailable",
        fingerprint=f"ap_offline:{access_point.id}",
        access_point_id=access_point.id,
    )
    return ticket if created else None


def evaluate_anomaly_ticket(db: Session, event: AnomalyEvent) -> IssueTicket | None:
    if event.severity not in {"High", "Critical"}:
        return None
    if not bool(get_setting(db, "auto_tickets_enabled", True)):
        return None
    ticket, created = create_ticket(
        db,
        title=f"AI {event.severity.lower()}-severity network anomaly",
        description=(
            "Isolation Forest flagged a live network measurement as statistically unusual. "
            f"{event.explanation} This is an anomaly observation, not a guaranteed prediction."
        ),
        priority="High" if event.severity == "High" else "Critical",
        issue_type="ai_anomaly",
        fingerprint="ai_anomaly:active",
        anomaly_event_id=event.id,
    )
    return ticket if created else None
