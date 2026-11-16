"""Access point CRUD, RBAC, configuration history and simulated-check tests."""

from __future__ import annotations

import uuid


def _payload(name_suffix: str = "") -> dict:
    suffix = name_suffix or uuid.uuid4().hex[:6]
    return {
        "name": f"Test AP {suffix}",
        "location": "Engineering Building, Test Lab",
        "ip_address": f"198.51.100.{uuid.uuid4().int % 200 + 1}",
        "vendor": "TestVendor",
        "model": "NP-Test",
        "is_simulated": False,
        "notes": "Created by automated tests",
    }


def test_seeded_access_points_are_labelled_simulations(client, admin_headers):
    response = client.get("/api/access-points", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    seeded = [ap for ap in body if ap["name"].startswith("[DEMO]")]
    assert len(seeded) >= 2
    assert all(ap["is_simulated"] for ap in seeded)
    assert all(ap["status"] == "simulated" for ap in seeded)


def test_create_update_history_performance_and_delete(client, admin_headers):
    payload = _payload()
    created = client.post("/api/access-points", headers=admin_headers, json=payload)
    assert created.status_code == 201, created.text
    ap = created.json()
    assert ap["name"] == payload["name"]
    assert ap["status"] == "unknown"
    assert ap["is_simulated"] is False

    updated = client.patch(
        f"/api/access-points/{ap['id']}",
        headers=admin_headers,
        json={"location": "Updated Location", "notes": "Updated by test"},
    )
    assert updated.status_code == 200
    assert updated.json()["location"] == "Updated Location"

    detail = client.get(f"/api/access-points/{ap['id']}", headers=admin_headers)
    assert detail.status_code == 200
    history = detail.json()["history"]
    assert len(history) >= 2
    assert {row["change_type"] for row in history} >= {"created", "updated"}

    performance = client.get(
        f"/api/access-points/{ap['id']}/performance?hours=24", headers=admin_headers
    )
    assert performance.status_code == 200
    assert performance.json()["measurements"] == 0
    assert performance.json()["uptime_pct"] is None

    deleted = client.delete(f"/api/access-points/{ap['id']}", headers=admin_headers)
    assert deleted.status_code == 200
    assert client.get(
        f"/api/access-points/{ap['id']}", headers=admin_headers
    ).status_code == 404


def test_duplicate_access_point_is_rejected(client, admin_headers):
    payload = _payload()
    first = client.post("/api/access-points", headers=admin_headers, json=payload)
    assert first.status_code == 201
    second = client.post("/api/access-points", headers=admin_headers, json=payload)
    assert second.status_code == 409
    assert "already exists" in second.json()["detail"]
    client.delete(
        f"/api/access-points/{first.json()['id']}", headers=admin_headers
    )


def test_invalid_ip_and_mac_are_validated(client, admin_headers):
    payload = _payload()
    payload["ip_address"] = "999.999.999.999"
    assert (
        client.post("/api/access-points", headers=admin_headers, json=payload).status_code
        == 422
    )

    payload = _payload()
    payload["mac_address"] = "not-a-mac"
    assert (
        client.post("/api/access-points", headers=admin_headers, json=payload).status_code
        == 422
    )


def test_analyst_and_viewer_cannot_create_access_points(client, accounts):
    for role in ("analyst", "viewer"):
        response = client.post(
            "/api/access-points",
            headers=accounts[role]["headers"],
            json=_payload(),
        )
        assert response.status_code == 403


def test_simulated_check_is_clearly_labelled_and_excluded(client, admin_headers):
    aps = client.get("/api/access-points", headers=admin_headers).json()
    simulated = next(ap for ap in aps if ap["is_simulated"])
    response = client.post(
        f"/api/access-points/{simulated['id']}/check", headers=admin_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_simulated"] is True
    assert "simulated availability check" in body["message"]
    assert body["measurement"]["data_origin"] == "simulation"
    assert body["measurement"]["probe_target"].startswith("SIMULATED:")

    performance = client.get(
        f"/api/access-points/{simulated['id']}/performance", headers=admin_headers
    )
    assert performance.status_code == 200
    assert performance.json()["simulated"] is True
    assert len(performance.json()["points"]) >= 1


def test_access_point_search_and_simulation_filter(client, admin_headers):
    search = client.get(
        "/api/access-points?search=Library", headers=admin_headers
    )
    assert search.status_code == 200
    assert all("library" in ap["name"].lower() or "library" in ap["location"].lower() for ap in search.json())

    real_only = client.get(
        "/api/access-points?include_simulated=false", headers=admin_headers
    )
    assert real_only.status_code == 200
    assert all(ap["is_simulated"] is False for ap in real_only.json())


def test_missing_access_point_returns_404(client, admin_headers):
    assert (
        client.get("/api/access-points/999999", headers=admin_headers).status_code == 404
    )
    assert (
        client.post("/api/access-points/999999/check", headers=admin_headers).status_code
        == 404
    )
