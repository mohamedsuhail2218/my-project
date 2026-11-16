"""Isolation Forest anomaly detection over live network observations.

The model identifies statistical outliers in latency, packet loss and jitter. It
does not predict future failures. Every stored event includes a human-readable
explanation of the features that contributed to the score.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
import sklearn
from scipy.stats import median_abs_deviation
from sklearn.ensemble import IsolationForest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnomalyEvent, NetworkMeasurement
from app.services.settings import get_setting
from app.services.ticketing import evaluate_anomaly_ticket

logger = logging.getLogger("netpulse.ai")
MODEL_VERSION = f"isolation-forest-v1/sklearn-{sklearn.__version__}"
FEATURES = ["latency_ms", "packet_loss_pct", "jitter_ms"]


def _measurement_frame(measurements: list[NetworkMeasurement]) -> pd.DataFrame:
    rows = []
    for m in measurements:
        rows.append(
            {
                "latency_ms": float(m.latency_ms or 0.0),
                "packet_loss_pct": float(m.packet_loss_pct if m.packet_loss_pct is not None else 100.0),
                "jitter_ms": float(m.jitter_ms or 0.0),
            }
        )
    return pd.DataFrame(rows, columns=FEATURES)


def _robust_z(value: float, baseline: pd.Series) -> float:
    median = float(baseline.median())
    mad = float(median_abs_deviation(baseline, scale="normal", nan_policy="omit"))
    if not np.isfinite(mad) or mad <= 0.0001:
        std = float(baseline.std(ddof=0))
        if not np.isfinite(std) or std <= 0.0001:
            return 0.0
        return abs(value - float(baseline.mean())) / std
    return abs(value - median) / mad


def train_anomaly_model(db: Session):
    """Fit on real history when sufficient; otherwise use labelled baseline."""
    min_samples = int(get_setting(db, "anomaly_min_samples", 30))
    contamination = float(get_setting(db, "anomaly_contamination", 0.08) or 0.08)
    real = db.scalars(
        select(NetworkMeasurement)
        .where(NetworkMeasurement.data_origin == "live")
        .order_by(NetworkMeasurement.recorded_at.desc())
        .limit(1200)
    ).all()
    real_frame = _measurement_frame(real) if real else pd.DataFrame(columns=FEATURES)
    use_sample = len(real_frame) < min_samples
    training = build_baseline() if use_sample else real_frame
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=1,
    )
    model.fit(training[FEATURES])
    return {
        "model": model,
        "training": training,
        "use_sample": use_sample,
        "min_samples": min_samples,
        "contamination": contamination,
        "real_history_count": len(real_frame),
        "baseline_medians": {feature: float(training[feature].median()) for feature in FEATURES},
    }


def build_baseline() -> pd.DataFrame:
    # Imported lazily to keep this module focused.
    from app.ai.sample_baseline import build_sample_baseline

    return build_sample_baseline()


def _severity_and_explanation(
    measurement: NetworkMeasurement,
    baseline: pd.DataFrame,
    raw_score: float,
    model_prediction: int,
) -> tuple[str, str, dict[str, Any]]:
    latency = float(measurement.latency_ms or 0.0)
    loss = float(measurement.packet_loss_pct)
    jitter = float(measurement.jitter_ms or 0.0)
    z_latency = _robust_z(latency, baseline["latency_ms"])
    z_loss = _robust_z(loss, baseline["packet_loss_pct"])
    z_jitter = _robust_z(jitter, baseline["jitter_ms"])

    reasons: list[str] = []
    if not measurement.is_online:
        reasons.append("the probe recorded no replies (100% packet loss)")
    if z_latency >= 3.0:
        reasons.append(
            f"latency {latency:.1f} ms is {z_latency:.1f} robust deviations above the baseline"
        )
    if z_loss >= 3.0:
        reasons.append(
            f"packet loss {loss:.1f}% is {z_loss:.1f} robust deviations above the baseline"
        )
    if z_jitter >= 3.0:
        reasons.append(
            f"jitter {jitter:.1f} ms is {z_jitter:.1f} robust deviations above the baseline"
        )

    critical = not measurement.is_online or z_latency >= 6.5 or loss >= 20.0 or z_loss >= 8.0
    high = z_latency >= 4.5 or z_loss >= 5.0 or z_jitter >= 4.5
    severity = "Critical" if critical else ("High" if high else "Medium")
    if model_prediction != -1:
        severity = "Low"

    if not reasons:
        reasons.append(
            "the combined feature vector was isolated by the trained forest, "
            "though no single metric crossed a fixed threshold"
        )
    explanation = (
        "Isolation Forest isolated this measurement because "
        + "; ".join(reasons)
        + ". "
        "This is a statistical anomaly observation, not a guaranteed prediction of future failure. "
        f"Anomaly score: {raw_score:.3f} (higher is more unusual)."
    )
    features = {
        "latency_ms": latency,
        "packet_loss_pct": loss,
        "jitter_ms": jitter,
        "is_online": measurement.is_online,
        "baseline_medians": {
            "latency_ms": round(float(baseline["latency_ms"].median()), 2),
            "packet_loss_pct": round(float(baseline["packet_loss_pct"].median()), 2),
            "jitter_ms": round(float(baseline["jitter_ms"].median()), 2),
        },
        "robust_z": {
            "latency": round(z_latency, 2),
            "packet_loss": round(z_loss, 2),
            "jitter": round(z_jitter, 2),
        },
        "model_raw_score": round(raw_score, 4),
    }
    return severity, explanation, features


def detect_anomalies(db: Session, limit: int = 50) -> dict[str, Any]:
    if not bool(get_setting(db, "auto_anomaly_detection", True)):
        return {
            "status": "disabled",
            "model_version": MODEL_VERSION,
            "training_samples": 0,
            "sample_baseline_used": False,
            "measurements_scored": 0,
            "anomalies_found": 0,
            "detected": [],
            "message": "Anomaly detection is disabled in Settings.",
        }

    bundle = train_anomaly_model(db)
    model = bundle["model"]
    training = bundle["training"]
    use_sample = bundle["use_sample"]
    real = db.scalars(
        select(NetworkMeasurement)
        .where(NetworkMeasurement.data_origin == "live")
        .order_by(NetworkMeasurement.recorded_at.desc())
        .limit(limit)
    ).all()
    if not real:
        return {
            "status": "no_live_data",
            "model_version": MODEL_VERSION,
            "training_samples": len(training),
            "sample_baseline_used": use_sample,
            "measurements_scored": 0,
            "anomalies_found": 0,
            "detected": [],
            "message": "No live measurements yet. Run a real network check first.",
        }

    scored = _measurement_frame(real)
    scores = model.score_samples(scored[FEATURES])
    predictions = model.predict(scored[FEATURES])
    existing_ids = set(
        db.scalars(
            select(AnomalyEvent.measurement_id).where(
                AnomalyEvent.measurement_id.in_([m.id for m in real])
            )
        ).all()
    )

    detected: list[AnomalyEvent] = []
    for measurement, raw_score, prediction in zip(real, scores, predictions, strict=False):
        if measurement.id in existing_ids or int(prediction) != -1:
            continue
        severity, explanation, features = _severity_and_explanation(
            measurement, training, float(-raw_score), int(prediction)
        )
        event = AnomalyEvent(
            measurement_id=measurement.id,
            access_point_id=measurement.access_point_id,
            anomaly_score=round(float(-raw_score), 4),
            severity=severity,
            detected_at=datetime.now(timezone.utc),
            explanation=explanation,
            features=features,
            model_version=MODEL_VERSION,
            used_sample_baseline=use_sample,
        )
        db.add(event)
        db.flush()
        evaluate_anomaly_ticket(db, event)
        detected.append(event)
    db.commit()
    for event in detected:
        db.refresh(event)

    source_text = (
        "a clearly-labelled synthetic student baseline (not live data)"
        if use_sample
        else f"{len(training)} real historical measurements"
    )
    logger.info("Anomaly detection scored %s measurements; %s anomalies", len(real), len(detected))
    return {
        "status": "completed",
        "model_version": MODEL_VERSION,
        "training_samples": len(training),
        "sample_baseline_used": use_sample,
        "measurements_scored": len(real),
        "anomalies_found": len(detected),
        "detected": detected,
        "message": (
            f"Scored {len(real)} recent live measurement(s) using {source_text}. "
            f"Detected {len(detected)} new statistical anomaly event(s). "
            "Anomalies describe unusual behaviour, not future failure predictions."
        ),
    }


def recent_anomalies(db: Session, limit: int = 50) -> list[AnomalyEvent]:
    return list(
        db.scalars(select(AnomalyEvent).order_by(AnomalyEvent.detected_at.desc()).limit(limit))
    )


def anomaly_window_summary(db: Session, hours: int = 24) -> dict[str, int]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    events = db.scalars(select(AnomalyEvent).where(AnomalyEvent.detected_at >= cutoff)).all()
    summary = {"total": len(events), "Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for event in events:
        summary[event.severity] = summary.get(event.severity, 0) + 1
    return summary
