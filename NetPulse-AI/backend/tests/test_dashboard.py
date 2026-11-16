"""Dashboard aggregation contract tests."""

from __future__ import annotations


def test_dashboard_overview_contract(client, admin_headers):
    response = client.get("/api/dashboard/overview?hours=24", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert {
        "summary",
        "latest_measurement",
        "series",
        "recent_alerts",
        "anomaly_breakdown",
        "ticket_breakdown",
        "monitoring",
        "window_hours",
        "generated_at",
        "disclaimer",
    } <= set(body.keys())
    summary = body["summary"]
    assert summary["simulated_access_points"] >= 2
    assert summary["total_access_points"] >= 0
    assert summary["known_devices"] >= 0
    assert summary["unknown_devices"] >= 0
    assert "Simulated AP records" in body["disclaimer"]
    assert body["window_hours"] == 24
    assert body["monitoring"]["method"].startswith("Live ICMP")


def test_dashboard_excludes_simulated_measurements(
    client, admin_headers, db, make_measurement
):
    from app.models import AccessPoint

    ap = db.query(AccessPoint).filter(AccessPoint.is_simulated.is_(True)).first()
    assert ap is not None
    make_measurement(
        latency_ms=987.6,
        packet_loss_pct=12.3,
        access_point_id=ap.id,
        data_origin="simulation",
        probe_target=f"SIMULATED:{ap.ip_address}",
    )
    response = client.get("/api/dashboard/overview", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert all(point["latency_ms"] != 987.6 for point in body["series"])
    latest = body["latest_measurement"]
    if latest is not None:
        assert latest["data_origin"] == "live"


def test_dashboard_validates_window(client, admin_headers):
    assert (
        client.get("/api/dashboard/overview?hours=0", headers=admin_headers).status_code
        == 422
    )
    assert (
        client.get("/api/dashboard/overview?hours=999", headers=admin_headers).status_code
        == 422
    )


def test_dashboard_calculates_health_from_live_measurements(
    client, admin_headers, make_measurement
):
    make_measurement(is_online=True, latency_ms=25.0, packet_loss_pct=0.0)
    response = client.get("/api/dashboard/overview", headers=admin_headers)
    body = response.json()
    assert response.status_code == 200
    assert body["summary"]["uptime_pct"] is not None
    assert 0 <= body["summary"]["uptime_pct"] <= 100
    assert body["summary"]["average_latency_ms"] is not None
