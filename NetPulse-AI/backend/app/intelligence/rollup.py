"""Compact intelligence roll-up shared by the API and dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.common import aware
from app.models import (
    OptimizationRecommendation,
    PredictionResult,
    RootCauseInvestigation,
    SecurityEvent,
)
from app.services.notifications import unread_count


def intelligence_overview(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    prediction_rows = list(
        db.scalars(
            select(PredictionResult)
            .where(PredictionResult.is_active.is_(True))
            .order_by(PredictionResult.risk_score.desc())
            .limit(40)
        ).all()
    )
    unique: dict[tuple[str, int | None], PredictionResult] = {}
    for row in prediction_rows:
        unique.setdefault((row.scope, row.access_point_id), row)
    highest = max(unique.values(), key=lambda row: row.risk_score, default=None)
    freshest = max((aware(row.predicted_at) for row in unique.values()), default=None)

    security_rows = list(
        db.scalars(
            select(SecurityEvent).where(
                SecurityEvent.status.in_(("Open", "Acknowledged"))
            )
        ).all()
    )
    optimization_rows = list(
        db.scalars(
            select(OptimizationRecommendation).where(
                OptimizationRecommendation.status == "Advisory"
            )
        ).all()
    )
    rca_rows = list(
        db.scalars(
            select(RootCauseInvestigation).where(
                RootCauseInvestigation.status.in_(("Open", "Acknowledged"))
            )
        ).all()
    )
    return {
        "prediction": {
            "highest_risk": round(highest.risk_score, 1) if highest else None,
            "highest_severity": highest.severity if highest else None,
            "at_risk": sum(1 for row in unique.values() if row.risk_score >= 50),
            "estimated": len(unique),
            "stale": bool(freshest and now - freshest > timedelta(hours=2)),
        },
        "security": {
            "open": len(security_rows),
            "high": sum(1 for row in security_rows if row.severity in {"Critical", "High"}),
            "unapproved_devices": sum(
                1 for row in security_rows if row.event_type == "unapproved_device"
            ),
        },
        "optimization": {
            "open": len(optimization_rows),
            "high": sum(1 for row in optimization_rows if row.severity == "High"),
        },
        "root_cause": {
            "open": len(rca_rows),
            "high": sum(1 for row in rca_rows if row.severity in {"Critical", "High"}),
        },
        "unread_notifications": unread_count(db),
        "generated_at": now.isoformat(),
    }
