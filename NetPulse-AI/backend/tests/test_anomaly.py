"""Isolation Forest training, detection and explanation tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.anomaly import (
    FEATURES,
    MODEL_VERSION,
    _severity_and_explanation,
    detect_anomalies,
    train_anomaly_model,
)
from app.ai.sample_baseline import build_sample_baseline
from app.core.database import Base
from app.models import AnomalyEvent, NetworkMeasurement


def _isolated_session():
    """A fresh in-memory database so ML results do not depend on test order."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def test_sample_baseline_is_deterministic_and_labelled():
    first = build_sample_baseline()
    second = build_sample_baseline()
    assert list(first.columns) == FEATURES
    assert len(first) == 120
    pd.testing.assert_frame_equal(first, second)
    assert "latency_ms" in FEATURES


def test_cold_start_uses_sample_baseline_when_history_is_insufficient():
    db = _isolated_session()
    try:
        bundle = train_anomaly_model(db)
        assert bundle["use_sample"] is True
        assert bundle["real_history_count"] == 0
        assert len(bundle["training"]) == 120
        assert bundle["model"] is not None
    finally:
        db.close()


def test_detection_returns_no_live_data_without_measurements():
    db = _isolated_session()
    try:
        result = detect_anomalies(db)
        assert result["status"] == "no_live_data"
        assert result["measurements_scored"] == 0
        assert result["anomalies_found"] == 0
        assert result["sample_baseline_used"] is True
        assert "No live measurements" in result["message"]
    finally:
        db.close()


def test_extreme_live_measurement_is_detected_and_explained():
    db = _isolated_session()
    try:
        now = datetime.now(timezone.utc)
        rng = __import__("random").Random(7)
        normal_ids = []
        for index in range(80):
            measurement = NetworkMeasurement(
                latency_ms=round(24.0 + rng.uniform(0.0, 7.0), 2),
                packet_loss_pct=round(rng.uniform(0.0, 0.9), 2),
                jitter_ms=round(1.0 + rng.uniform(0.0, 2.0), 2),
                is_online=True,
                probe_target="198.51.100.10",
                data_origin="live",
                recorded_at=now - timedelta(minutes=90 - index),
            )
            db.add(measurement)
            db.flush()
            normal_ids.append(measurement.id)
        extreme = NetworkMeasurement(
            latency_ms=2400.0,
            packet_loss_pct=85.0,
            jitter_ms=650.0,
            is_online=False,
            probe_target="198.51.100.10",
            data_origin="live",
            error_message="Total loss",
            recorded_at=now,
        )
        db.add(extreme)
        db.commit()
        db.refresh(extreme)

        result = detect_anomalies(db, limit=100)
        assert result["status"] == "completed"
        assert result["sample_baseline_used"] is False
        assert result["measurements_scored"] == 81
        assert result["anomalies_found"] >= 1
        detected = db.query(AnomalyEvent).all()
        assert detected
        assert any(event.measurement_id == extreme.id for event in detected)
        critical = next(event for event in detected if event.measurement_id == extreme.id)
        assert critical.severity == "Critical"
        assert critical.anomaly_score > 0
        assert "statistical anomaly" in critical.explanation
        assert "not a guaranteed prediction" in critical.explanation
        assert critical.features["latency_ms"] == 2400.0
        assert critical.model_version == MODEL_VERSION

        repeated = detect_anomalies(db, limit=100)
        assert repeated["anomalies_found"] == 0
    finally:
        db.close()


def test_offline_measurement_always_gets_critical_explanation():
    measurement = NetworkMeasurement(
        latency_ms=None,
        packet_loss_pct=100.0,
        jitter_ms=None,
        is_online=False,
        probe_target="203.0.113.9",
        data_origin="live",
        error_message="No replies",
    )
    baseline = build_sample_baseline()
    severity, explanation, features = _severity_and_explanation(
        measurement, baseline, raw_score=0.81, model_prediction=-1
    )
    assert severity == "Critical"
    assert "no replies" in explanation
    assert features["is_online"] is False
    assert features["model_raw_score"] == 0.81


def test_model_info_and_api_contract(client, admin_headers):
    info = client.get("/api/anomalies/model-info", headers=admin_headers)
    assert info.status_code == 200
    body = info.json()
    assert body["algorithm"].startswith("Isolation Forest")
    assert body["features"] == FEATURES
    assert body["minimum_real_samples"] >= 8
    assert "never shown as live telemetry" in body["cold_start_note"]

    listing = client.get("/api/anomalies", headers=admin_headers)
    assert listing.status_code == 200
    assert {"anomalies", "summary", "window", "disclaimer"} <= set(listing.json())
    assert "not a substitute" in listing.json()["disclaimer"]

    detection = client.post("/api/anomalies/detect", headers=admin_headers)
    assert detection.status_code == 200
    assert detection.json()["status"] in {"completed", "no_live_data", "disabled"}


def test_anomaly_filter_validation(client, admin_headers):
    response = client.get("/api/anomalies?severity=Unknown", headers=admin_headers)
    assert response.status_code == 422
