"""Autonomous intelligence endpoints: prediction, RCA, security, optimisation."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.intelligence.optimization import (
    generate_recommendations,
    recommendation_feed,
    set_recommendation_status,
)
from app.intelligence.prediction import generate_predictions, prediction_feed
from app.intelligence.rca import investigation_feed, resolve_investigation, run_investigation
from app.intelligence.rollup import intelligence_overview
from app.intelligence.security import resolve_security_event, run_security_scan, security_feed
from app.schemas.intelligence import RCARequest, StatusUpdate

router = APIRouter(prefix="/intelligence", tags=["Autonomous Intelligence"])


@router.get("/predictions")
def predictions(db: DbSession, _: CurrentUser) -> dict:
    return prediction_feed(db)


@router.post("/predictions/run")
def run_predictions(db: DbSession, _: AnalystUser) -> dict:
    return generate_predictions(db)


@router.get("/root-cause")
def root_cause(
    db: DbSession,
    _: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return investigation_feed(db, limit=limit)


@router.post("/root-cause/run")
def run_root_cause(payload: RCARequest | None, db: DbSession, _: AnalystUser) -> dict:
    data = payload or RCARequest()
    if data.measurement_id is not None:
        from app.models import NetworkMeasurement

        if db.get(NetworkMeasurement, data.measurement_id) is None:
            raise HTTPException(status_code=404, detail="Measurement not found")
    if data.access_point_id is not None:
        from app.models import AccessPoint

        if db.get(AccessPoint, data.access_point_id) is None:
            raise HTTPException(status_code=404, detail="Access point not found")
    return run_investigation(
        db,
        measurement_id=data.measurement_id,
        access_point_id=data.access_point_id,
    )


@router.patch("/root-cause/{investigation_id}")
def update_investigation(
    investigation_id: int, payload: StatusUpdate, db: DbSession, _: AnalystUser
) -> dict:
    if payload.status not in {"Open", "Acknowledged", "Resolved"}:
        raise HTTPException(status_code=422, detail="Investigation status must be Open, Acknowledged or Resolved")
    row = resolve_investigation(db, investigation_id, status=payload.status)
    if row is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return row


@router.get("/security")
def security(db: DbSession, _: CurrentUser) -> dict:
    return security_feed(db)


@router.post("/security/scan")
def scan_security(db: DbSession, _: AnalystUser) -> dict:
    return run_security_scan(db)


@router.patch("/security/{event_id}")
def update_security_event(
    event_id: int, payload: StatusUpdate, db: DbSession, _: AnalystUser
) -> dict:
    if payload.status not in {"Open", "Acknowledged", "Resolved"}:
        raise HTTPException(status_code=422, detail="Security status must be Open, Acknowledged or Resolved")
    row = resolve_security_event(db, event_id, status=payload.status)
    if row is None:
        raise HTTPException(status_code=404, detail="Security event not found")
    return row


@router.get("/optimization")
def optimization(db: DbSession, _: CurrentUser) -> dict:
    return recommendation_feed(db)


@router.post("/optimization/scan")
def scan_optimization(db: DbSession, _: AnalystUser) -> dict:
    return generate_recommendations(db)


@router.patch("/optimization/{recommendation_id}")
def update_recommendation(
    recommendation_id: int, payload: StatusUpdate, db: DbSession, _: AnalystUser
) -> dict:
    if payload.status not in {"Advisory", "Planned", "Dismissed"}:
        raise HTTPException(
            status_code=422, detail="Recommendation status must be Advisory, Planned or Dismissed"
        )
    row = set_recommendation_status(db, recommendation_id, payload.status)
    if row is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return row


@router.get("/summary")
def intelligence_summary(db: DbSession, _: CurrentUser) -> dict:
    """Compact roll-up used by the overview dashboard."""
    return intelligence_overview(db)


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return value


def _csv_response(headers: list[str], rows: list[list], kind: str, status: str) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_cell(value) for value in row])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="netpulse_{kind}_{stamp}.csv"',
            "X-NetPulse-Status": status,
            "Cache-Control": "no-store",
        },
    )


@router.get("/export.csv")
def export_csv(
    db: DbSession,
    _: CurrentUser,
    kind: str = Query(
        default="predictions",
        description="One of: predictions, root-cause, security, optimization",
    ),
) -> StreamingResponse:
    """Download a persisted intelligence feed as CSV.

    Files contain only persisted engine output. When an engine reports
    insufficient data the CSV still has headers and the response carries
    ``X-NetPulse-Status: insufficient_data`` instead of fabricated rows.
    """
    if kind == "predictions":
        feed = prediction_feed(db)
        headers = [
            "scope", "access_point_id", "access_point_name", "risk_score",
            "severity", "confidence", "horizon_hours", "data_points",
            "predicted_at", "model_version", "method", "primary_driver",
            "online_ratio_pct", "mean_latency_ms", "mean_packet_loss_pct",
            "mean_jitter_ms", "latency_trend_pct", "explanation",
        ]
        rows = []
        for item in feed["predictions"]:
            features = item.get("features") or {}
            rows.append([
                item.get("scope"), item.get("access_point_id"), item.get("access_point_name"),
                item.get("risk_score"), item.get("severity"), item.get("confidence"),
                item.get("horizon_hours"), item.get("data_points"), item.get("predicted_at"),
                item.get("model_version"), item.get("method"),
                features.get("primary_driver"), features.get("online_ratio_pct"),
                features.get("mean_latency_ms"), features.get("mean_packet_loss_pct"),
                features.get("mean_jitter_ms"), features.get("latency_trend_pct"),
                item.get("explanation"),
            ])
        return _csv_response(headers, rows, "failure-risk", feed["status"])

    if kind == "root-cause":
        feed = investigation_feed(db, limit=500)
        headers = [
            "id", "status", "severity", "confidence", "problem", "probable_cause",
            "access_point_id", "access_point_name", "measurement_id", "data_points",
            "generated_at", "resolved_at", "recommended_actions", "evidence",
            "related_incident_ids", "method",
        ]
        rows = [
            [
                item.get("id"), item.get("status"), item.get("severity"), item.get("confidence"),
                item.get("problem"), item.get("probable_cause"), item.get("access_point_id"),
                item.get("access_point_name"), item.get("measurement_id"), item.get("data_points"),
                item.get("generated_at"), item.get("resolved_at"),
                " | ".join(item.get("recommended_actions") or []),
                item.get("evidence") or [], item.get("related_incident_ids") or [],
                item.get("method"),
            ]
            for item in feed["investigations"]
        ]
        return _csv_response(headers, rows, "root-cause", feed["status"])

    if kind == "security":
        feed = security_feed(db, limit=500)
        headers = [
            "id", "event_type", "category", "severity", "status", "source",
            "title", "description", "recommendation", "confidence", "fingerprint",
            "is_simulated", "detected_at", "resolved_at", "evidence",
        ]
        rows = [
            [
                item.get("id"), item.get("event_type"), item.get("category"),
                item.get("severity"), item.get("status"), item.get("source"),
                item.get("title"), item.get("description"), item.get("recommendation"),
                item.get("confidence"), item.get("fingerprint"), item.get("is_simulated"),
                item.get("detected_at"), item.get("resolved_at"), item.get("evidence") or {},
            ]
            for item in feed["events"]
        ]
        return _csv_response(headers, rows, "security-findings", feed["status"])

    if kind == "optimization":
        feed = recommendation_feed(db)
        headers = [
            "id", "category", "category_label", "severity", "status", "title",
            "description", "access_point_id", "access_point_name", "confidence",
            "data_points", "expected_impact_pct", "updated_at", "actions", "evidence",
        ]
        rows = [
            [
                item.get("id"), item.get("category"), item.get("category_label"),
                item.get("severity"), item.get("status"), item.get("title"),
                item.get("description"), item.get("access_point_id"),
                item.get("access_point_name"), item.get("confidence"),
                item.get("data_points"), item.get("expected_impact_pct"),
                item.get("updated_at"), " | ".join(item.get("actions") or []),
                item.get("evidence") or {},
            ]
            for item in feed["recommendations"]
        ]
        return _csv_response(headers, rows, "optimisation", feed["status"])

    raise HTTPException(
        status_code=400,
        detail="kind must be one of: predictions, root-cause, security, optimization",
    )
