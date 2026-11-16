"""Authentication, authorization and account-management tests."""

from __future__ import annotations

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_health_is_public(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert "No fabricated live telemetry" in body["live_measurement_policy"]


def test_admin_can_log_in(client):
    response = client.post(
        "/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["role"] == "admin"
    assert body["user"]["email"] == ADMIN_EMAIL
    assert body["user"]["last_login_at"] is not None


def test_wrong_password_is_rejected(client):
    response = client.post(
        "/api/auth/login", json={"email": ADMIN_EMAIL, "password": "ThisIsWrong123!"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_unknown_email_is_rejected_without_leaking_account_state(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "not-a-user@test.netpulse.ai", "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_me_returns_signed_in_user(client, admin_headers):
    response = client.get("/api/auth/me", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["email"] == ADMIN_EMAIL


def test_protected_routes_require_a_token(client):
    response = client.get("/api/dashboard/overview")
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]


def test_invalid_token_is_rejected(client):
    response = client.get(
        "/api/dashboard/overview", headers={"Authorization": "Bearer not.a.real.token"}
    )
    assert response.status_code == 401


def test_admin_creates_viewer_and_duplicate_is_rejected(client, admin_headers):
    payload = {
        "email": "duplicate.user@test.netpulse.ai",
        "full_name": "Duplicate User",
        "password": "DuplicatePass123!",
        "role": "viewer",
    }
    first = client.post("/api/auth/users", headers=admin_headers, json=payload)
    assert first.status_code == 201
    assert first.json()["role"] == "viewer"

    duplicate = client.post("/api/auth/users", headers=admin_headers, json=payload)
    assert duplicate.status_code == 409


def test_viewer_cannot_manage_users(client, accounts):
    response = client.get("/api/auth/users", headers=accounts["viewer"]["headers"])
    assert response.status_code == 403
    assert "admin role" in response.json()["detail"]


def test_analyst_cannot_manage_users(client, accounts):
    response = client.get("/api/auth/users", headers=accounts["analyst"]["headers"])
    assert response.status_code == 403


def test_user_validation_returns_field_errors(client, admin_headers):
    response = client.post(
        "/api/auth/users",
        headers=admin_headers,
        json={
            "email": "not-an-email",
            "full_name": "X",
            "password": "short",
            "role": "superuser",
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Some fields are invalid"
    fields = {item["field"] for item in body["errors"]}
    assert {"email", "full_name", "password", "role"} <= fields


def test_viewer_can_read_dashboard_but_not_change_configuration(client, accounts):
    read = client.get("/api/dashboard/overview", headers=accounts["viewer"]["headers"])
    assert read.status_code == 200
    write = client.patch(
        "/api/settings",
        headers=accounts["viewer"]["headers"],
        json={"organization_name": "Nope"},
    )
    assert write.status_code == 403
