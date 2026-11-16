"""AI anomaly detection and explanation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.ai.anomaly import MODEL_VERSION, anomaly_window_summary, detect_anomalies
from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.core.config import settings
from app.models import AnomalyEvent, NetworkMeasurement
from app.schemas.schemas import AnomalyDetectionSummary, AnomalyOut
from app.services.settings import get_setting

router = APIRouter(prefix="/anomalies", tags=["AI Anomaly Detection"])


@router.get("")
def list_anomalies(
    db: DbSession,
    _: CurrentUser,
    severity: str | None = Query(default=None, pattern="^(Critical|High|Medium|Low)$"),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    query = select(AnomalyEvent)
    if severity:
        query = query.where(AnomalyEvent.severity == severity)
    events = db.scalars(query.order_by(AnomalyEvent.detected_at.desc()).limit(limit)).all()
    by_severity = {
        level: db.scalar(select(func.count(AnomalyEvent.id)).where(AnomalyEvent.severity == level)) or 0
        for level in ("Critical", "High", "Medium", "Low")
    }
    return {
        "anomalies": [AnomalyOut.model_validate(event) for event in events],
        "summary": {**by_severity, "total": sum(by_severity.values())},
        "window": anomaly_window_summary(db, hours=24),
        "disclaimer": (
            "Isolation Forest flags statistical outliers in collected measurements. "
            "It does not predict future failures and is not a substitute for network expertise."
        ),
    }


@router.post("/detect", response_model=AnomalyDetectionSummary)
def run_detection(db: DbSession, _: AnalystUser) -> AnomalyDetectionSummary:
    result = detect_anomalies(db)
    return AnomalyDetectionSummary(
        status=result["status"],
        model_version=result["model_version"],
        training_samples=result["training_samples"],
        sample_baseline_used=result["sample_baseline_used"],
        measurements_scored=result["measurements_scored"],
        anomalies_found=result["anomalies_found"],
        detected=[AnomalyOut.model_validate(event) for event in result["detected"]],
        message=result["message"],
    )


@router.get("/model-info")
def model_info(db: DbSession, _: CurrentUser) -> dict:
    real_count = db.scalar(
        select(func.count(NetworkMeasurement.id)).where(NetworkMeasurement.data_origin == "live")
    ) or 0
    min_samples = int(get_setting(db, "anomaly_min_samples", 30))
    return {
        "algorithm": "Isolation Forest (scikit-learn)",
        "model_version": MODEL_VERSION,
        "features": ["latency_ms", "packet_loss_pct", "jitter_ms"],
        "contamination": float(get_setting(db, "anomaly_contamination", 0.08)),
        "minimum_real_samples": min_samples,
        "real_live_measurements": real_count,
        "cold_start_mode": "labelled synthetic baseline" if real_count < min_samples else "real measurements",
        "cold_start_note": (
            "When fewer than the minimum real observations exist, a deterministic synthetic "
            "baseline is used only for model fitting. It is never shown as live telemetry. "
            "Once enough real measurements exist, the model automatically retrains on them."
        ),
        "enabled": bool(get_setting(db, "auto_anomaly_detection", True)),
        "disclaimer": "Statistical anomaly detection only; no future-failure guarantee.",
    }
