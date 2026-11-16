"""Shared pytest fixtures.

The environment is configured before importing the FastAPI application so the
suite always uses a throw-away SQLite database and never touches the developer
database, starts background probes, or writes reports into the project tree.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

TEST_ROOT = Path(tempfile.gettempdir()) / f"netpulse-tests-{uuid.uuid4().hex[:10]}"
TEST_ROOT.mkdir(parents=True, exist_ok=True)
TEST_DB = TEST_ROOT / "netpulse-test.db"
REPORTS_DIR = TEST_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_EMAIL = "admin@test.netpulse.ai"
ADMIN_PASSWORD = "AdminTestPass123!"
USER_PASSWORD = "RoleTestPass123!"

os.environ.update(
    {
        "ENVIRONMENT": "testing",
        "DEBUG": "false",
        "DATABASE_URL": f"sqlite:///{TEST_DB.as_posix()}",
        "JWT_SECRET_KEY": "test-only-jwt-secret-key-that-is-long-enough-1234567890",
        "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
        "ADMIN_EMAIL": ADMIN_EMAIL,
        "ADMIN_PASSWORD": ADMIN_PASSWORD,
        "ADMIN_FULL_NAME": "Test Administrator",
        "MONITORING_ENABLED": "false",
        "MONITOR_ON_STARTUP": "false",
        "DEVICE_DISCOVERY_ENABLED": "true",
        "TEST_RUNNER_ENABLED": "false",
        "AUTO_TICKETS_ENABLED": "true",
        "AUTO_ANOMALY_DETECTION": "true",
        "LATENCY_THRESHOLD_MS": "150",
        "PACKET_LOSS_THRESHOLD_PCT": "5",
        "ANOMALY_MIN_SAMPLES": "30",
        "REPORTS_DIR": str(REPORTS_DIR),
    }
)

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import NetworkMeasurement  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_headers(client):
    response = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def accounts(client, admin_headers):
    """Create one analyst and one viewer account for role tests."""
    created = {}
    for role in ("analyst", "viewer"):
        email = f"{role}.suite@test.netpulse.ai"
        response = client.post(
            "/api/auth/users",
            headers=admin_headers,
            json={
                "email": email,
                "full_name": f"Test {role.title()}",
                "password": USER_PASSWORD,
                "role": role,
            },
        )
        assert response.status_code == 201, response.text
        login = client.post(
            "/api/auth/login", json={"email": email, "password": USER_PASSWORD}
        )
        assert login.status_code == 200, login.text
        created[role] = {
            "email": email,
            "password": USER_PASSWORD,
            "user": login.json()["user"],
            "headers": {"Authorization": f"Bearer {login.json()['access_token']}"},
        }
    return created


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture()
def make_measurement(db):
    """Factory for persisted measurements with sane, explicit defaults."""

    def factory(
        *,
        latency_ms: float | None = 32.5,
        packet_loss_pct: float = 0.0,
        jitter_ms: float | None = 2.1,
        is_online: bool = True,
        data_origin: str = "live",
        access_point_id: int | None = None,
        probe_target: str = "198.51.100.10",
        recorded_at: datetime | None = None,
    ) -> NetworkMeasurement:
        measurement = NetworkMeasurement(
            access_point_id=access_point_id,
            latency_ms=latency_ms,
            packet_loss_pct=packet_loss_pct,
            jitter_ms=jitter_ms,
            is_online=is_online,
            probe_target=probe_target,
            data_origin=data_origin,
            error_message=None if is_online else "Test probe received no replies",
            recorded_at=recorded_at or datetime.now(timezone.utc),
        )
        db.add(measurement)
        db.commit()
        db.refresh(measurement)
        return measurement

    return factory
