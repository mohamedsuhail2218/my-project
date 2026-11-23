"""Network optimisation recommendations derived from measured performance.

Recommendations are advisory only. NetPulse AI does not change router, switch or
access-point settings. Each recommendation cites the measured averages and the
number of observations behind it, and the engine refuses to recommend anything
when the observation window is too small.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.common import aware, format_ms, format_pct, iso, mean
from app.models import AccessPoint, NetworkMeasurement, OptimizationRecommendation
from app.services.notifications import notify
from app.services.settings import get_setting

METHOD = "Measured-performance advisory v1"
WINDOW_HOURS = 24
MIN_NETWORK_POINTS = 8
MIN_AP_POINTS = 4
REFRESH_WINDOW = timedelta(days=7)
DISCLAIMER = (
    "Optimisation advice is generated from measured telemetry and is advisory only. "
    "No configuration changes are applied automatically, and expected gains are not "
    "estimated unless they can be derived from the data."
)

CATEGORY_LABELS = {
    "packet_loss": "Packet loss",
    "latency": "Latency",
    "jitter": "Jitter",
    "availability": "Availability",
}


def _measurements(
    db: Session, cutoff: datetime, access_point_id: int | None = None
) -> list[NetworkMeasurement]:
    query = select(NetworkMeasurement).where(
        NetworkMeasurement.data_origin == "live",
        NetworkMeasurement.recorded_at >= cutoff,
    )
    if access_point_id is not None:
        query = query.where(NetworkMeasurement.access_point_id == access_point_id)
    return list(
        db.scalars(query.order_by(NetworkMeasurement.recorded_at.asc()).limit(2000)).all()
    )


def _build(
    points: list[NetworkMeasurement],
    *,
    access_point_id: int | None,
    scope_label: str,
    latency_threshold: float,
    loss_threshold: float,
) -> list[dict]:
    latency = mean(point.latency_ms for point in points)
    loss = mean(point.packet_loss_pct for point in points)
    jitter = mean(point.jitter_ms for point in points)
    online_ratio = (
        sum(1 for point in points if point.is_online) / len(points) * 100 if points else 0
    )
    confidence = round(min(0.88, 0.48 + len(points) / 40), 2)
    findings: list[dict] = []

    if loss is not None and loss > loss_threshold:
        findings.append(
            {
                "category": "packet_loss",
                "severity": "High" if loss >= loss_threshold * 2 else "Medium",
                "title": f"Reduce packet loss on {scope_label}",
                "description": (
                    f"Average packet loss was {format_pct(loss)} across {len(points)} live "
                    f"measurements in the last {WINDOW_HOURS} hours, above the "
                    f"{loss_threshold:.1f}% threshold."
                ),
                "evidence": {
                    "average_packet_loss_pct": loss,
                    "threshold_pct": loss_threshold,
                    "data_points": len(points),
                    "online_ratio_pct": round(online_ratio, 2),
                },
                "actions": [
                    "Check wireless interference and channel utilisation on the access point.",
                    "Compare loss to the gateway and to the internet target.",
                    "Inspect switch port errors and cabling on the wired uplink.",
                    "Consider QoS or traffic shaping for bandwidth-heavy clients.",
                ],
            }
        )
    if latency is not None and latency > latency_threshold:
        findings.append(
            {
                "category": "latency",
                "severity": "High" if latency >= latency_threshold * 2 else "Medium",
                "title": f"Reduce latency on {scope_label}",
                "description": (
                    f"Average latency was {format_ms(latency)} across {len(points)} live "
                    f"measurements, above the {latency_threshold:.0f} ms threshold."
                ),
                "evidence": {
                    "average_latency_ms": latency,
                    "threshold_ms": latency_threshold,
                    "data_points": len(points),
                    "online_ratio_pct": round(online_ratio, 2),
                },
                "actions": [
                    "Compare local-gateway and internet latency to localise the delay.",
                    "Review access-point client load and uplink utilisation.",
                    "Move the access point or client to improve signal quality.",
                    "Check for buffer pressure or saturated WAN links.",
                ],
            }
        )
    if jitter is not None and jitter > 15:
        findings.append(
            {
                "category": "jitter",
                "severity": "Medium" if jitter < 30 else "High",
                "title": f"Stabilise jitter on {scope_label}",
                "description": (
                    f"Average jitter was {format_ms(jitter)} across {len(points)} live "
                    "measurements, above the 15 ms stability guideline."
                ),
                "evidence": {
                    "average_jitter_ms": jitter,
                    "guideline_ms": 15,
                    "data_points": len(points),
                },
                "actions": [
                    "Check signal strength and retry counters on wireless clients.",
                    "Reduce channel overlap with neighbouring access points.",
                    "Enable QoS for latency-sensitive voice or video traffic.",
                    "Repeat the measurement to confirm persistent instability.",
                ],
            }
        )
    if points and online_ratio < 80:
        findings.append(
            {
                "category": "availability",
                "severity": "High" if online_ratio < 60 else "Medium",
                "title": f"Improve probe availability for {scope_label}",
                "description": (
                    f"{round(online_ratio, 1)}% of {len(points)} live probes were online in "
                    f"the last {WINDOW_HOURS} hours."
                ),
                "evidence": {
                    "online_ratio_pct": round(online_ratio, 2),
                    "data_points": len(points),
                },
                "actions": [
                    "Verify power and uplink status for the target access point.",
                    "Review probe error messages for timeout or DNS patterns.",
                    "Confirm the probe target is reachable from the monitoring host.",
                    "Check whether maintenance windows explain the outages.",
                ],
            }
        )

    for finding in findings:
        finding["confidence"] = confidence
        finding["access_point_id"] = access_point_id
        finding["fingerprint"] = (
            f"optimization:{finding['category']}:"
            f"{access_point_id if access_point_id is not None else 'network'}"
        )
        finding["data_points"] = len(points)
    return findings


def _upsert(db: Session, finding: dict) -> tuple[OptimizationRecommendation, bool]:
    cutoff = datetime.now(timezone.utc) - REFRESH_WINDOW
    existing = db.scalar(
        select(OptimizationRecommendation)
        .where(
            OptimizationRecommendation.fingerprint == finding["fingerprint"],
            OptimizationRecommendation.status == "Advisory",
            OptimizationRecommendation.generated_at >= cutoff,
        )
        .order_by(OptimizationRecommendation.generated_at.desc())
        .limit(1)
    )
    if existing is not None:
        existing.title = finding["title"]
        existing.description = finding["description"]
        existing.evidence = finding["evidence"]
        existing.actions = finding["actions"]
        existing.severity = finding["severity"]
        existing.confidence = finding["confidence"]
        existing.data_points = finding["data_points"]
        existing.updated_at = datetime.now(timezone.utc)
        return existing, False
    row = OptimizationRecommendation(
        access_point_id=finding["access_point_id"],
        category=finding["category"],
        severity=finding["severity"],
        title=finding["title"],
        description=finding["description"],
        evidence=finding["evidence"],
        actions=finding["actions"],
        expected_impact_pct=None,
        confidence=finding["confidence"],
        status="Advisory",
        fingerprint=finding["fingerprint"],
        data_points=finding["data_points"],
    )
    db.add(row)
    db.flush()
    return row, True


def generate_recommendations(db: Session) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    points = _measurements(db, cutoff)
    latency_threshold = float(get_setting(db, "latency_threshold_ms", 150.0))
    loss_threshold = float(get_setting(db, "packet_loss_threshold_pct", 5.0))

    if len(points) < MIN_NETWORK_POINTS:
        return {
            "status": "insufficient_data",
            "message": (
                f"{len(points)} of {MIN_NETWORK_POINTS} required live measurements are "
                f"available in the last {WINDOW_HOURS} hours. No optimisation advice was "
                "generated."
            ),
            "recommendations": [],
            "available_points": len(points),
            "minimum_required": MIN_NETWORK_POINTS,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "method": METHOD,
            "disclaimer": DISCLAIMER,
        }

    findings = _build(
        points,
        access_point_id=None,
        scope_label="the network",
        latency_threshold=latency_threshold,
        loss_threshold=loss_threshold,
    )
    for access_point in db.scalars(
        select(AccessPoint).where(AccessPoint.is_simulated.is_(False))
    ).all():
        ap_points = _measurements(db, cutoff, access_point_id=access_point.id)
        if len(ap_points) < MIN_AP_POINTS:
            continue
        findings.extend(
            _build(
                ap_points,
                access_point_id=access_point.id,
                scope_label=access_point.name,
                latency_threshold=latency_threshold,
                loss_threshold=loss_threshold,
            )
        )

    created_count = 0
    for finding in findings:
        row, created = _upsert(db, finding)
        if created:
            created_count += 1
            if row.severity == "High":
                notify(
                    db,
                    kind="optimization",
                    severity=row.severity,
                    title=row.title,
                    message=row.description,
                    path="/optimization",
                    dedupe_key=f"optimization:{row.fingerprint}:{datetime.now(timezone.utc):%Y-%m-%d}",
                    metadata={"recommendation_id": row.id, "category": row.category},
                )
    db.commit()

    feed = recommendation_feed(db)
    feed.update(
        {
            "status": "ready",
            "message": (
                f"Generated {created_count} new recommendation(s) and refreshed "
                f"{len(findings) - created_count} existing one(s) from {len(points)} "
                "live measurements."
            ),
            "available_points": len(points),
            "minimum_required": MIN_NETWORK_POINTS,
            "method": METHOD,
            "disclaimer": DISCLAIMER,
        }
    )
    return feed


def _serialise(row: OptimizationRecommendation, access_points: dict[int, str]) -> dict:
    return {
        "id": row.id,
        "access_point_id": row.access_point_id,
        "access_point_name": access_points.get(row.access_point_id),
        "category": row.category,
        "category_label": CATEGORY_LABELS.get(row.category, row.category.replace("_", " ").title()),
        "severity": row.severity,
        "title": row.title,
        "description": row.description,
        "evidence": row.evidence or {},
        "actions": row.actions or [],
        "expected_impact_pct": row.expected_impact_pct,
        "confidence": round(row.confidence, 2),
        "status": row.status,
        "fingerprint": row.fingerprint,
        "data_points": row.data_points,
        "generated_at": iso(row.generated_at),
        "updated_at": iso(row.updated_at),
    }


def recommendation_feed(db: Session) -> dict:
    rows = list(
        db.scalars(
            select(OptimizationRecommendation)
            .order_by(OptimizationRecommendation.updated_at.desc())
            .limit(100)
        ).all()
    )
    access_points = {ap.id: ap.name for ap in db.scalars(select(AccessPoint)).all()}
    recommendations = [
        _serialise(row, access_points) for row in rows if row.status != "Dismissed"
    ]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    available = len(_measurements(db, cutoff))
    if recommendations:
        status = "ready"
        message = "Recommendations are based on the last 24 hours of live measurements."
    elif available < MIN_NETWORK_POINTS:
        status = "insufficient_data"
        message = (
            f"{available} of {MIN_NETWORK_POINTS} required live measurements are available "
            f"in the last {WINDOW_HOURS} hours."
        )
    else:
        status = "not_run"
        message = "Enough telemetry is available. Run the optimisation scan for advice."

    categories: dict[str, int] = {}
    for item in recommendations:
        categories[item["category"]] = categories.get(item["category"], 0) + 1
    return {
        "status": status,
        "message": message,
        "recommendations": recommendations,
        "summary": {
            "total": len(recommendations),
            "high": sum(1 for item in recommendations if item["severity"] == "High"),
            "medium": sum(1 for item in recommendations if item["severity"] == "Medium"),
            "low": sum(1 for item in recommendations if item["severity"] == "Low"),
            "categories": categories,
            "latest_at": recommendations[0]["updated_at"] if recommendations else None,
        },
        "available_points": available,
        "minimum_required": MIN_NETWORK_POINTS,
        "window_hours": WINDOW_HOURS,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": METHOD,
        "disclaimer": DISCLAIMER,
    }


def set_recommendation_status(db: Session, recommendation_id: int, status: str) -> dict | None:
    row = db.get(OptimizationRecommendation, recommendation_id)
    if row is None:
        return None
    row.status = status
    db.commit()
    db.refresh(row)
    access_points = {ap.id: ap.name for ap in db.scalars(select(AccessPoint)).all()}
    return _serialise(row, access_points)
