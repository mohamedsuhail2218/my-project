"""Autonomous intelligence engine and API contract tests.

Engine tests use an isolated in-memory database so risk, root-cause, security and
optimisation results never depend on test ordering or on the developer database.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.intelligence.optimization import (
    MIN_NETWORK_POINTS as OPTIMIZATION_MIN_POINTS,
    generate_recommendations,
    recommendation_feed,
)
from app.intelligence.prediction import (
    MIN_NETWORK_POINTS,
    generate_predictions,
    prediction_feed,
)
from app.intelligence.rca import investigation_feed, run_investigation
from app.intelligence.security import run_security_scan, security_feed
from app.models import (
    AccessPoint,
    Device,
    LoginAttempt,
    NetworkMeasurement,
)


def _isolated_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def _add_measurement(
    db,
    *,
    latency_ms=42.0,
    packet_loss_pct=0.4,
    jitter_ms=3.0,
    is_online=True,
    access_point_id=None,
    data_origin="live",
    recorded_at=None,
):
    row = NetworkMeasurement(
        access_point_id=access_point_id,
        latency_ms=latency_ms,
        packet_loss_pct=packet_loss_pct,
        jitter_ms=jitter_ms,
        is_online=is_online,
        probe_target="198.51.100.20",
        data_origin=data_origin,
        recorded_at=recorded_at or datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def test_prediction_engine_reports_insufficient_data_instead_of_inventing_risk():
    db = _isolated_session()
    try:
        result = generate_predictions(db)
        assert result["status"] == "insufficient_data"
        assert result["predictions"] == []
        assert result["available_points"] == 0
        assert result["minimum_required"] == MIN_NETWORK_POINTS
        assert "inventing a prediction" in result["disclaimer"]
        feed = prediction_feed(db)
        assert feed["status"] == "insufficient_data"
        assert feed["summary"]["highest_risk"] is None
    finally:
        db.close()


def test_prediction_engine_scores_only_live_measurements_and_explains_weights():
    db = _isolated_session()
    try:
        now = datetime.now(timezone.utc)
        for index in range(10):
            _add_measurement(
                db,
                latency_ms=180.0 + index,
                packet_loss_pct=6.5,
                jitter_ms=18.0,
                is_online=index < 8,
                recorded_at=now - timedelta(minutes=20 - index),
            )
        for index in range(5):
            _add_measurement(
                db,
                latency_ms=999.0,
                packet_loss_pct=80.0,
                jitter_ms=90.0,
                is_online=False,
                data_origin="simulation",
                recorded_at=now - timedelta(minutes=5, seconds=index),
            )
        db.commit()

        result = generate_predictions(db)
        assert result["status"] == "ok"
        assert result["available_points"] == 10
        assert len(result["predictions"]) == 1
        network = result["predictions"][0]
        assert network["scope"] == "network"
        assert network["access_point_id"] is None
        assert network["risk_score"] >= 25
        assert network["data_points"] == 10
        assert network["data_origin"] == "live"
        assert set(network["features"]["components"]) == {
            "availability",
            "packet_loss",
            "latency",
            "jitter",
        }
        assert "recent probes were online" in network["explanation"]
        assert network["features"]["window_points"] == 10
    finally:
        db.close()


def test_prediction_feed_distinguishes_not_run_from_insufficient_data():
    db = _isolated_session()
    try:
        now = datetime.now(timezone.utc)
        for index in range(MIN_NETWORK_POINTS):
            _add_measurement(db, recorded_at=now - timedelta(minutes=index))
        db.commit()
        feed = prediction_feed(db)
        assert feed["status"] == "not_run"
        assert feed["available_points"] == MIN_NETWORK_POINTS
        assert feed["predictions"] == []
    finally:
        db.close()


def test_root_cause_requires_evidence_and_creates_explainable_investigation():
    db = _isolated_session()
    try:
        empty = run_investigation(db)
        assert empty["status"] == "insufficient_data"
        assert empty["investigation"] is None

        _add_measurement(db, is_online=False, latency_ms=None, packet_loss_pct=100.0)
        db.commit()
        result = run_investigation(db)
        assert result["status"] == "ok"
        investigation = result["investigation"]
        assert investigation["severity"] == "Critical"
        assert investigation["status"] == "Open"
        assert investigation["evidence"]
        assert investigation["recommended_actions"]
        assert investigation["confidence"] > 0.5
        assert "certainties" in result["disclaimer"]
        feed = investigation_feed(db)
        assert feed["summary"]["total"] == 1
        assert feed["summary"]["open"] == 1
    finally:
        db.close()


def test_root_cause_reports_clear_state_for_healthy_measurement():
    db = _isolated_session()
    try:
        _add_measurement(
            db,
            latency_ms=24.0,
            packet_loss_pct=0.0,
            jitter_ms=2.0,
            is_online=True,
        )
        db.commit()
        result = run_investigation(db)
        assert result["status"] == "clear"
        assert result["investigation"] is None
        assert "no fault signature" in result["message"].lower()
    finally:
        db.close()


def test_security_scan_uses_local_evidence_and_deduplicates_findings():
    db = _isolated_session()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            Device(
                identifier_hash="a" * 64,
                display_name="Unknown laptop",
                hostname="unknown-lan-host",
                ip_address="192.168.1.77",
                mac_masked="aa:bb:cc:xx:xx:xx",
                is_approved=False,
                is_active=True,
                first_seen_at=now - timedelta(minutes=10),
                last_seen_at=now - timedelta(minutes=2),
            )
        )
        for index in range(5):
            db.add(
                LoginAttempt(
                    email="admin@netpulse.ai",
                    ip_address="203.0.113.44",
                    success=False,
                    attempted_at=now - timedelta(minutes=index),
                )
            )
        db.commit()

        result = run_security_scan(db)
        assert result["status"] == "ready"
        types = {event["event_type"] for event in result["events"]}
        assert types == {"unapproved_device", "authentication_failure_burst"}
        assert result["summary"]["open"] == 2
        assert result["summary"]["posture_score"] <= 70
        assert all(event["is_simulated"] is False for event in result["events"])

        second = run_security_scan(db)
        assert len(second["events"]) == 2
        assert len(security_feed(db)["events"]) == 2
    finally:
        db.close()


def test_optimization_refuses_advice_without_enough_live_telemetry():
    db = _isolated_session()
    try:
        result = generate_recommendations(db)
        assert result["status"] == "insufficient_data"
        assert result["recommendations"] == []
        assert result["minimum_required"] == OPTIMIZATION_MIN_POINTS
        empty = recommendation_feed(db)
        assert empty["status"] == "insufficient_data"
        assert empty["recommendations"] == []
    finally:
        db.close()


def test_optimization_builds_advisory_from_measured_threshold_breaches():
    db = _isolated_session()
    try:
        now = datetime.now(timezone.utc)
        for index in range(OPTIMIZATION_MIN_POINTS + 2):
            _add_measurement(
                db,
                latency_ms=260.0,
                packet_loss_pct=14.0,
                jitter_ms=24.0,
                is_online=True,
                recorded_at=now - timedelta(minutes=index * 5),
            )
        db.commit()
        result = generate_recommendations(db)
        assert result["status"] == "ready"
        categories = {item["category"] for item in result["recommendations"]}
        assert {"packet_loss", "latency", "jitter"} <= categories
        assert all(item["status"] == "Advisory" for item in result["recommendations"])
        assert all(item["expected_impact_pct"] is None for item in result["recommendations"])
        assert all(item["actions"] for item in result["recommendations"])
    finally:
        db.close()


# --- API contracts ---------------------------------------------------------


def test_intelligence_endpoints_return_explicit_state_envelopes(client, admin_headers):
    for path, key in (
        ("/api/intelligence/predictions", "predictions"),
        ("/api/intelligence/root-cause", "investigations"),
        ("/api/intelligence/security", "events"),
        ("/api/intelligence/optimization", "recommendations"),
    ):
        response = client.get(path, headers=admin_headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] in {"ready", "not_run", "insufficient_data"}
        assert key in body
        assert "disclaimer" in body
        assert "method" in body

    summary = client.get("/api/intelligence/summary", headers=admin_headers)
    assert summary.status_code == 200
    assert {
        "prediction",
        "security",
        "optimization",
        "root_cause",
        "unread_notifications",
    } <= set(summary.json())


def test_viewer_cannot_run_intelligence_engines(client, accounts):
    viewer = accounts["viewer"]["headers"]
    for path in (
        "/api/intelligence/predictions/run",
        "/api/intelligence/root-cause/run",
        "/api/intelligence/security/scan",
        "/api/intelligence/optimization/scan",
    ):
        response = client.post(path, headers=viewer, json={})
        assert response.status_code == 403, path


def test_intelligence_csv_exports_are_real_files(client, admin_headers):
    expected_headers = {
        "predictions": "scope,access_point_id,access_point_name",
        "root-cause": "id,status,severity,confidence",
        "security": "id,event_type,category,severity",
        "optimization": "id,category,category_label,severity",
    }
    for kind, header_prefix in expected_headers.items():
        response = client.get(
            f"/api/intelligence/export.csv?kind={kind}", headers=admin_headers
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        assert "attachment" in response.headers["content-disposition"]
        assert response.headers["x-netpulse-status"] in {
            "ready",
            "not_run",
            "insufficient_data",
        }
        first_line = response.text.splitlines()[0]
        assert first_line.startswith(header_prefix)

    invalid = client.get(
        "/api/intelligence/export.csv?kind=unknown", headers=admin_headers
    )
    assert invalid.status_code == 400


def test_notification_centre_contract(client, admin_headers):
    listing = client.get("/api/notifications?limit=5", headers=admin_headers)
    assert listing.status_code == 200
    body = listing.json()
    assert {
        "notifications",
        "unread",
        "by_severity",
        "generated_at",
    } <= set(body)
    unread = client.get("/api/notifications/unread-count", headers=admin_headers)
    assert unread.status_code == 200
    assert unread.json()["unread"] >= 0


def test_live_status_documents_polling_fallback(client, admin_headers):
    status = client.get("/api/live/status", headers=admin_headers)
    assert status.status_code == 200
    body = status.json()
    assert body["transport"] == "websocket"
    assert body["polling_fallback"] is True
    assert body["persistent_process_required"] is True
    snapshot = client.get("/api/live/snapshot", headers=admin_headers)
    assert snapshot.status_code == 200
    assert snapshot.json()["type"] == "snapshot"


def test_dashboard_exposes_intelligence_rollup(client, admin_headers):
    response = client.get("/api/dashboard/overview?hours=24", headers=admin_headers)
    assert response.status_code == 200
    rollup = response.json()["intelligence"]
    assert {"prediction", "security", "optimization", "root_cause"} <= set(rollup)
    assert "generated_at" in rollup
