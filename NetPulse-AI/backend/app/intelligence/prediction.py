"""Explainable failure-risk estimation from real probe telemetry.

This is a transparent statistical model, not a black box: each risk score is a
weighted combination of measured availability, packet loss, latency and jitter
relative to the configured thresholds. Predictions are only produced when the
observation window contains enough real measurements. There is no synthetic
data and no guarantee that a predicted failure will occur.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.common import (
    aware,
    clamp,
    format_ms,
    format_pct,
    iso,
    mean,
    risk_severity,
)
from app.models import AccessPoint, NetworkMeasurement, PredictionResult
from app.services.notifications import notify
from app.services.settings import get_setting

MODEL_VERSION = "explainable-risk-v1"
METHOD = "Weighted threshold model (availability, loss, latency, jitter)"
WINDOW_HOURS = 72
MIN_NETWORK_POINTS = 8
MIN_AP_POINTS = 6
STALE_AFTER = timedelta(hours=2)

DISCLAIMER = (
    "Risk scores are statistical estimates computed from real probe measurements. "
    "They are not guarantees, and the engine reports insufficient data rather than "
    "inventing a prediction when the observation window is too small."
)


def _points(
    db: Session,
    cutoff: datetime,
    access_point_id: int | None = None,
    limit: int = 2000,
) -> list[NetworkMeasurement]:
    query = select(NetworkMeasurement).where(
        NetworkMeasurement.data_origin == "live",
        NetworkMeasurement.recorded_at >= cutoff,
    )
    if access_point_id is not None:
        query = query.where(NetworkMeasurement.access_point_id == access_point_id)
    return list(
        db.scalars(query.order_by(NetworkMeasurement.recorded_at.asc()).limit(limit)).all()
    )


def _available_points(db: Session, hours: int = WINDOW_HOURS) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return len(
        db.scalars(
            select(NetworkMeasurement.id).where(
                NetworkMeasurement.data_origin == "live",
                NetworkMeasurement.recorded_at >= cutoff,
            )
        ).all()
    )


def _trend_pct(values: list[float]) -> float | None:
    """Least-squares slope over the window, expressed as % of the mean."""
    if len(values) < 4:
        return None
    count = len(values)
    mean_x = (count - 1) / 2
    mean_y = sum(values) / count
    denominator = sum((index - mean_x) ** 2 for index in range(count))
    if denominator == 0 or mean_y == 0:
        return None
    slope = sum((index - mean_x) * (value - mean_y) for index, value in enumerate(values))
    slope /= denominator
    return round(slope * (count - 1) / mean_y * 100, 2)


def _score(
    points: list[NetworkMeasurement],
    latency_threshold: float,
    loss_threshold: float,
) -> dict:
    recent = points[-min(12, len(points)) :]
    online = sum(1 for point in recent if point.is_online)
    online_ratio = online / len(recent) if recent else 0.0

    recent_latency = [point.latency_ms for point in recent if point.latency_ms is not None]
    recent_loss = [point.packet_loss_pct for point in recent]
    recent_jitter = [point.jitter_ms for point in recent if point.jitter_ms is not None]

    latency = mean(recent_latency)
    loss = mean(recent_loss)
    jitter = mean(recent_jitter)
    latency_trend = _trend_pct(
        [point.latency_ms for point in points if point.latency_ms is not None]
    )

    components = {
        "availability": round((1 - online_ratio) * 40, 2),
        "packet_loss": round(min(1.0, (loss or 0.0) / max(loss_threshold, 0.1)) * 25, 2),
        "latency": round(min(1.0, (latency or 0.0) / max(latency_threshold * 2, 1.0)) * 20, 2),
        "jitter": round(min(1.0, (jitter or 0.0) / 30.0) * 15, 2),
    }
    score = round(clamp(sum(components.values())), 2)
    driver = max(components, key=components.get) if score > 0 else "none"
    driver_labels = {
        "availability": "probe availability",
        "packet_loss": "packet loss",
        "latency": "latency level",
        "jitter": "jitter",
        "none": "no dominant driver",
    }

    trend_text = (
        f" Latency trend across the window: {latency_trend:+.1f}%."
        if latency_trend is not None
        else " A latency trend needs at least four readings."
    )
    explanation = (
        f"{online} of {len(recent)} recent probes were online. "
        f"Mean latency {format_ms(latency)} against a {latency_threshold:.0f} ms threshold; "
        f"mean packet loss {format_pct(loss)} against a {loss_threshold:.1f}% threshold; "
        f"mean jitter {format_ms(jitter)}.{trend_text} "
        f"Primary contributor: {driver_labels[driver]}."
    )

    confidence = round(min(0.92, 0.42 + len(points) / 60), 2)
    if len(points) >= 30:
        confidence = 0.9
    return {
        "score": score,
        "severity": risk_severity(score),
        "confidence": confidence,
        "explanation": explanation,
        "features": {
            "window_points": len(points),
            "recent_points": len(recent),
            "online_ratio_pct": round(online_ratio * 100, 2),
            "mean_latency_ms": latency,
            "mean_packet_loss_pct": loss,
            "mean_jitter_ms": jitter,
            "latency_trend_pct": latency_trend,
            "latency_threshold_ms": latency_threshold,
            "packet_loss_threshold_pct": loss_threshold,
            "components": components,
            "primary_driver": driver,
        },
    }


def _deactivate_old(db: Session) -> None:
    for row in db.scalars(select(PredictionResult).where(PredictionResult.is_active.is_(True))).all():
        row.is_active = False


def generate_predictions(db: Session) -> dict:
    """Recompute network and per-AP risk. Returns an explicit status envelope."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    network_points = _points(db, cutoff)
    latency_threshold = float(get_setting(db, "latency_threshold_ms", 150.0))
    loss_threshold = float(get_setting(db, "packet_loss_threshold_pct", 5.0))

    if len(network_points) < MIN_NETWORK_POINTS:
        _deactivate_old(db)
        db.commit()
        return {
            "status": "insufficient_data",
            "message": (
                f"{len(network_points)} of {MIN_NETWORK_POINTS} required live measurements "
                f"are available in the last {WINDOW_HOURS} hours. Run live monitoring to "
                "collect enough telemetry before a risk estimate can be produced."
            ),
            "available_points": len(network_points),
            "minimum_required": MIN_NETWORK_POINTS,
            "predictions": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "method": METHOD,
            "model_version": MODEL_VERSION,
            "disclaimer": DISCLAIMER,
        }

    _deactivate_old(db)
    created: list[PredictionResult] = []

    network_result = _score(network_points, latency_threshold, loss_threshold)
    network_row = PredictionResult(
        scope="network",
        access_point_id=None,
        risk_score=network_result["score"],
        severity=network_result["severity"],
        confidence=network_result["confidence"],
        horizon_hours=24,
        data_points=len(network_points),
        data_origin="live",
        method=METHOD,
        model_version=MODEL_VERSION,
        explanation=network_result["explanation"],
        features=network_result["features"],
    )
    db.add(network_row)
    created.append(network_row)

    for access_point in db.scalars(
        select(AccessPoint).where(AccessPoint.is_simulated.is_(False))
    ).all():
        ap_points = _points(db, cutoff, access_point_id=access_point.id)
        if len(ap_points) < MIN_AP_POINTS:
            continue
        result = _score(ap_points, latency_threshold, loss_threshold)
        row = PredictionResult(
            scope="access_point",
            access_point_id=access_point.id,
            risk_score=result["score"],
            severity=result["severity"],
            confidence=result["confidence"],
            horizon_hours=24,
            data_points=len(ap_points),
            data_origin="live",
            method=METHOD,
            model_version=MODEL_VERSION,
            explanation=result["explanation"],
            features=result["features"],
        )
        db.add(row)
        created.append(row)

    db.flush()
    for row in created:
        if row.severity not in {"Critical", "High"}:
            continue
        scope_label = "Network-wide" if row.scope == "network" else "Access point"
        notify(
            db,
            kind="prediction",
            severity=row.severity,
            title=f"{row.severity} failure risk · {scope_label}",
            message=f"Estimated {row.risk_score:.0f}/100 risk over the next 24 hours. {row.explanation}",
            path="/predictive",
            dedupe_key=f"prediction:{row.scope}:{row.access_point_id}:{row.severity}:{datetime.now(timezone.utc):%Y-%m-%d}",
            metadata={"prediction_id": row.id, "risk_score": row.risk_score},
        )
    db.commit()

    feed = prediction_feed(db)
    feed.update(
        {
            "status": "ok",
            "message": f"Generated {len(created)} risk estimate(s) from {len(network_points)} live measurements.",
            "available_points": len(network_points),
            "minimum_required": MIN_NETWORK_POINTS,
            "method": METHOD,
            "model_version": MODEL_VERSION,
            "disclaimer": DISCLAIMER,
        }
    )
    return feed


def prediction_feed(db: Session) -> dict:
    rows = list(
        db.scalars(
            select(PredictionResult)
            .where(PredictionResult.is_active.is_(True))
            .order_by(PredictionResult.predicted_at.desc(), PredictionResult.id.desc())
            .limit(120)
        ).all()
    )
    latest: dict[tuple[str, int | None], PredictionResult] = {}
    for row in rows:
        key = (row.scope, row.access_point_id)
        if key not in latest:
            latest[key] = row

    access_points = {
        ap.id: ap.name for ap in db.scalars(select(AccessPoint)).all()
    }
    predictions = [
        {
            "id": row.id,
            "scope": row.scope,
            "access_point_id": row.access_point_id,
            "access_point_name": access_points.get(row.access_point_id),
            "risk_score": round(row.risk_score, 2),
            "severity": row.severity,
            "confidence": round(row.confidence, 2),
            "horizon_hours": row.horizon_hours,
            "data_points": row.data_points,
            "data_origin": row.data_origin,
            "method": row.method,
            "model_version": row.model_version,
            "explanation": row.explanation,
            "features": row.features,
            "predicted_at": iso(row.predicted_at),
        }
        for row in sorted(latest.values(), key=lambda item: item.risk_score, reverse=True)
    ]

    latest_at = max((aware(row.predicted_at) for row in latest.values()), default=None)
    age = datetime.now(timezone.utc) - latest_at if latest_at else None
    stale = bool(age and age > STALE_AFTER)
    available = _available_points(db)

    if predictions:
        status = "ready"
        message = (
            "Risk estimates are current."
            if not stale
            else "Risk estimates are stale; run the analysis again to refresh them."
        )
    elif available < MIN_NETWORK_POINTS:
        status = "insufficient_data"
        message = (
            f"{available} of {MIN_NETWORK_POINTS} required live measurements are available "
            f"in the last {WINDOW_HOURS} hours."
        )
    else:
        status = "not_run"
        message = "Enough telemetry is available. Run the risk analysis to generate estimates."

    severities = [item["severity"] for item in predictions]
    return {
        "status": status,
        "message": message,
        "stale": stale,
        "available_points": available,
        "minimum_required": MIN_NETWORK_POINTS,
        "window_hours": WINDOW_HOURS,
        "predictions": predictions,
        "summary": {
            "total": len(predictions),
            "at_risk": sum(1 for item in predictions if item["risk_score"] >= 50),
            "critical": sum(1 for item in predictions if item["severity"] == "Critical"),
            "high": sum(1 for item in predictions if item["severity"] == "High"),
            "average_risk": round(
                sum(item["risk_score"] for item in predictions) / len(predictions), 2
            )
            if predictions
            else None,
            "highest_risk": predictions[0] if predictions else None,
            "highest_severity": severities[0] if severities else None,
        },
        "latest_at": iso(latest_at),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": METHOD,
        "model_version": MODEL_VERSION,
        "disclaimer": DISCLAIMER,
    }
