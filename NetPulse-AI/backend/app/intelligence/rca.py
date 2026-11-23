"""Root-cause analysis built from measured evidence and correlated events.

The engine follows a transparent rule set. It never changes device configuration
and it never claims certainty: each investigation lists the measurements it used,
a confidence value and the safest next diagnostic steps. If no fault signature
exists it reports a clear state instead of creating a false incident.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.common import aware, clamp, format_ms, format_pct, iso
from app.models import (
    AccessPoint,
    AnomalyEvent,
    IssueTicket,
    NetworkMeasurement,
    RootCauseInvestigation,
)
from app.services.notifications import notify
from app.services.settings import get_setting
from app.troubleshooting.engine import SAFETY_NOTE

METHOD = "Rule-based evidence correlation v1"
DISCLAIMER = (
    "Probable causes are diagnostic hypotheses derived from locally measured evidence. "
    "They are not certainties and no configuration is changed automatically."
)
ACTIVE_TICKET_STATUSES = ("Open", "In Progress")

CAUSE_LIBRARY = {
    "connectivity_failure": (
        "The probe could not reach the target. Likely causes are an access-point "
        "outage, an upstream routing/DNS failure, or a local adapter problem.",
        [
            "Confirm the access point has power and a working uplink.",
            "Ping the local gateway from the monitoring host to separate LAN from WAN faults.",
            "Verify DNS resolution and the configured probe target.",
            "Check the host adapter, cable or Wi-Fi association.",
        ],
    ),
    "congestion": (
        "Packet loss is occurring together with elevated latency, which is consistent "
        "with congestion, buffer pressure or a degraded wireless link.",
        [
            "Inspect uplink utilisation and the number of active clients on the access point.",
            "Compare wired and wireless probes to localise the congested segment.",
            "Review QoS policy for bandwidth-heavy clients.",
            "Check for interference or excessive retries on the wireless channel.",
        ],
    ),
    "packet_loss": (
        "Measured packet loss exceeds the configured threshold. This points to "
        "interference, retries, a failing cable/port or upstream congestion.",
        [
            "Compare loss across multiple probe targets.",
            "Check wireless interference and channel utilisation.",
            "Inspect switch port errors if the access point is wired.",
            "Re-run the probe after moving closer to the access point.",
        ],
    ),
    "high_latency": (
        "Latency is above the configured threshold. Likely causes are upstream "
        "congestion, a weak Wi-Fi signal or an overloaded access point.",
        [
            "Compare latency to the gateway and to the internet target.",
            "Check access-point client load and channel utilisation.",
            "Test from a wired connection to isolate the wireless path.",
            "Review recent network changes that could affect routing.",
        ],
    ),
    "jitter": (
        "Jitter is elevated, which is typical of an unstable wireless link, "
        "interference or variable queueing on the path.",
        [
            "Check signal strength and retry counters on the wireless client.",
            "Look for channel overlap with neighbouring access points.",
            "Enable QoS for latency-sensitive traffic if appropriate.",
            "Repeat the measurement to confirm the instability.",
        ],
    ),
    "anomaly": (
        "A statistical anomaly was recorded near this measurement. The anomaly model "
        "flags unusual combinations of latency, loss and jitter rather than a known fault.",
        [
            "Review the anomaly explanation and the contributing features.",
            "Correlate the timestamp with network changes or high-usage periods.",
            "Continue monitoring and open a ticket if the pattern repeats.",
        ],
    ),
}


def _serialise(db: Session, row: RootCauseInvestigation) -> dict:
    access_point = db.get(AccessPoint, row.access_point_id) if row.access_point_id else None
    return {
        "id": row.id,
        "measurement_id": row.measurement_id,
        "access_point_id": row.access_point_id,
        "access_point_name": access_point.name if access_point else None,
        "problem": row.problem,
        "probable_cause": row.probable_cause,
        "severity": row.severity,
        "confidence": round(row.confidence, 2),
        "evidence": row.evidence or [],
        "recommended_actions": row.recommended_actions or [],
        "related_incident_ids": row.related_incident_ids or [],
        "status": row.status,
        "method": row.method,
        "data_points": row.data_points,
        "generated_at": iso(row.generated_at),
        "resolved_at": iso(row.resolved_at),
        "safety_note": SAFETY_NOTE,
    }


def _measurement_for(
    db: Session, measurement_id: int | None, access_point_id: int | None
) -> NetworkMeasurement | None:
    if measurement_id is not None:
        return db.get(NetworkMeasurement, measurement_id)
    query = select(NetworkMeasurement).where(NetworkMeasurement.data_origin == "live")
    if access_point_id is not None:
        query = query.where(NetworkMeasurement.access_point_id == access_point_id)
    return db.scalar(query.order_by(NetworkMeasurement.recorded_at.desc()).limit(1))


def _related_anomalies(db: Session, measurement: NetworkMeasurement) -> list[AnomalyEvent]:
    recorded = aware(measurement.recorded_at) or datetime.now(timezone.utc)
    lower = recorded - timedelta(minutes=30)
    upper = recorded + timedelta(minutes=30)
    query = select(AnomalyEvent).where(
        AnomalyEvent.detected_at >= lower,
        AnomalyEvent.detected_at <= upper,
    )
    if measurement.access_point_id is not None:
        query = query.where(AnomalyEvent.access_point_id == measurement.access_point_id)
    return list(db.scalars(query.order_by(AnomalyEvent.detected_at.desc()).limit(10)).all())


def _related_tickets(db: Session, access_point_id: int | None) -> list[IssueTicket]:
    query = select(IssueTicket).where(IssueTicket.status.in_(ACTIVE_TICKET_STATUSES))
    if access_point_id is not None:
        query = query.where(IssueTicket.access_point_id == access_point_id)
    return list(db.scalars(query.order_by(IssueTicket.created_at.desc()).limit(10)).all())


def run_investigation(
    db: Session,
    *,
    measurement_id: int | None = None,
    access_point_id: int | None = None,
) -> dict:
    measurement = _measurement_for(db, measurement_id, access_point_id)
    if measurement is None:
        return {
            "status": "insufficient_data",
            "message": "No live measurement is available to investigate. Run live monitoring first.",
            "investigation": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "method": METHOD,
            "disclaimer": DISCLAIMER,
        }

    latency_threshold = float(get_setting(db, "latency_threshold_ms", 150.0))
    loss_threshold = float(get_setting(db, "packet_loss_threshold_pct", 5.0))
    anomalies = _related_anomalies(db, measurement)
    tickets = _related_tickets(db, measurement.access_point_id)
    access_point = (
        db.get(AccessPoint, measurement.access_point_id)
        if measurement.access_point_id is not None
        else None
    )

    latency = measurement.latency_ms
    loss = measurement.packet_loss_pct
    jitter = measurement.jitter_ms
    issue_type: str | None = None
    severity = "Medium"
    problem = ""
    confidence = 0.55

    if not measurement.is_online:
        issue_type = "connectivity_failure"
        severity = "Critical"
        confidence = 0.88
        problem = f"Connectivity probe to {measurement.probe_target} failed."
    elif loss >= loss_threshold and latency is not None and latency >= latency_threshold:
        issue_type = "congestion"
        severity = "High"
        confidence = 0.82
        problem = (
            f"Packet loss {loss:.2f}% and latency {latency:.1f} ms both exceed their thresholds."
        )
    elif loss >= loss_threshold:
        issue_type = "packet_loss"
        severity = "High" if loss >= loss_threshold * 2 else "Medium"
        confidence = 0.76
        problem = f"Packet loss {loss:.2f}% exceeds the {loss_threshold:.1f}% threshold."
    elif latency is not None and latency >= latency_threshold:
        issue_type = "high_latency"
        severity = "High" if latency >= latency_threshold * 2 else "Medium"
        confidence = 0.7
        problem = f"Latency {latency:.1f} ms exceeds the {latency_threshold:.0f} ms threshold."
    elif jitter is not None and jitter >= 15:
        issue_type = "jitter"
        severity = "Medium"
        confidence = 0.66
        problem = f"Jitter {jitter:.1f} ms is above the 15 ms stability guideline."
    elif anomalies:
        issue_type = "anomaly"
        severity = anomalies[0].severity
        confidence = 0.6
        problem = "A statistical anomaly was detected near this measurement."
    else:
        recorded = aware(measurement.recorded_at)
        return {
            "status": "clear",
            "message": (
                "The latest measurement shows no fault signature: the probe is online and "
                "latency, packet loss and jitter are within configured thresholds."
            ),
            "investigation": None,
            "measurement": {
                "id": measurement.id,
                "latency_ms": measurement.latency_ms,
                "packet_loss_pct": measurement.packet_loss_pct,
                "jitter_ms": measurement.jitter_ms,
                "is_online": measurement.is_online,
                "recorded_at": iso(recorded),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "method": METHOD,
            "disclaimer": DISCLAIMER,
        }

    if anomalies:
        confidence = clamp(confidence + 0.05, 0.0, 0.95)
    recorded = aware(measurement.recorded_at)
    if recorded and datetime.now(timezone.utc) - recorded > timedelta(hours=6):
        confidence = clamp(confidence - 0.1, 0.0, 0.95)

    cause, actions = CAUSE_LIBRARY[issue_type]
    evidence = [
        {
            "label": "Probe target",
            "value": measurement.probe_target,
            "source": f"measurement #{measurement.id}",
        },
        {
            "label": "Measured latency",
            "value": format_ms(latency),
            "source": f"threshold {latency_threshold:.0f} ms",
        },
        {
            "label": "Measured packet loss",
            "value": format_pct(loss),
            "source": f"threshold {loss_threshold:.1f}%",
        },
        {
            "label": "Measured jitter",
            "value": format_ms(jitter),
            "source": "stability guideline 15 ms",
        },
    ]
    if measurement.error_message:
        evidence.append(
            {
                "label": "Probe error",
                "value": measurement.error_message,
                "source": f"measurement #{measurement.id}",
            }
        )
    if access_point is not None:
        evidence.append(
            {
                "label": "Access point",
                "value": f"{access_point.name} ({access_point.status})",
                "source": access_point.location,
            }
        )
    if anomalies:
        evidence.append(
            {
                "label": "Correlated anomalies",
                "value": f"{len(anomalies)} event(s) within 30 minutes",
                "source": "anomaly_events",
            }
        )
    if tickets:
        evidence.append(
            {
                "label": "Related open tickets",
                "value": ", ".join(ticket.ticket_number for ticket in tickets[:4]),
                "source": "issue_tickets",
            }
        )

    window_start = datetime.now(timezone.utc) - timedelta(hours=24)
    data_points = len(
        db.scalars(
            select(NetworkMeasurement.id).where(
                NetworkMeasurement.data_origin == "live",
                NetworkMeasurement.recorded_at >= window_start,
                NetworkMeasurement.access_point_id == measurement.access_point_id
                if measurement.access_point_id is not None
                else NetworkMeasurement.access_point_id.is_(None),
            )
        ).all()
    )

    row = RootCauseInvestigation(
        measurement_id=measurement.id,
        access_point_id=measurement.access_point_id,
        problem=problem,
        probable_cause=cause,
        severity=severity,
        confidence=round(confidence, 2),
        evidence=evidence,
        recommended_actions=actions,
        related_incident_ids=[event.id for event in anomalies]
        + [ticket.id for ticket in tickets],
        status="Open",
        method=METHOD,
        data_points=data_points,
    )
    db.add(row)
    db.flush()
    if severity in {"Critical", "High"}:
        scope = access_point.name if access_point else "Network"
        notify(
            db,
            kind="root_cause",
            severity=severity,
            title=f"{severity} root-cause investigation · {scope}",
            message=problem,
            path="/root-cause",
            dedupe_key=f"rca:{measurement.access_point_id}:{issue_type}:{datetime.now(timezone.utc):%Y-%m-%d}",
            metadata={"investigation_id": row.id, "issue_type": issue_type},
        )
    db.commit()
    db.refresh(row)
    return {
        "status": "ok",
        "message": "Investigation generated from measured evidence.",
        "investigation": _serialise(db, row),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": METHOD,
        "disclaimer": DISCLAIMER,
    }


def investigation_feed(db: Session, limit: int = 50) -> dict:
    rows = list(
        db.scalars(
            select(RootCauseInvestigation)
            .order_by(RootCauseInvestigation.generated_at.desc())
            .limit(limit)
        ).all()
    )
    investigations = [_serialise(db, row) for row in rows]
    latest_measurement = db.scalar(
        select(NetworkMeasurement)
        .where(NetworkMeasurement.data_origin == "live")
        .order_by(NetworkMeasurement.recorded_at.desc())
        .limit(1)
    )
    if rows:
        status = "ready"
        message = "Investigations are generated from persisted measurements and correlated events."
    elif latest_measurement is None:
        status = "insufficient_data"
        message = "No live measurement is available yet. Run live monitoring to collect evidence."
    else:
        status = "not_run"
        message = "A live measurement is available. Run an investigation to analyse it."

    return {
        "status": status,
        "message": message,
        "investigations": investigations,
        "summary": {
            "total": len(investigations),
            "open": sum(1 for item in investigations if item["status"] == "Open"),
            "resolved": sum(1 for item in investigations if item["status"] == "Resolved"),
            "critical": sum(1 for item in investigations if item["severity"] == "Critical"),
            "high": sum(1 for item in investigations if item["severity"] == "High"),
            "latest_at": investigations[0]["generated_at"] if investigations else None,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": METHOD,
        "disclaimer": DISCLAIMER,
        "safety_note": SAFETY_NOTE,
    }


def resolve_investigation(db: Session, investigation_id: int, status: str = "Resolved") -> dict | None:
    row = db.get(RootCauseInvestigation, investigation_id)
    if row is None:
        return None
    row.status = status
    row.resolved_at = datetime.now(timezone.utc) if status == "Resolved" else None
    db.commit()
    db.refresh(row)
    return _serialise(db, row)
