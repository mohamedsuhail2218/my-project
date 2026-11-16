"""Automated test dashboard and JUnit parser tests.

The API runner is disabled in the pytest environment on purpose: starting a
second pytest process from inside pytest would be recursive. Parser behaviour is
still covered directly.
"""

from __future__ import annotations

from pathlib import Path

from app.services.test_runner import _parse_junit, _suite_for, current_run, persisted_runs


def test_testing_dashboard_contract(client, admin_headers):
    response = client.get("/api/tests", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert {
        "results",
        "runs",
        "current_run",
        "latest_run_id",
        "passed",
        "failed",
        "skipped",
        "suites",
        "note",
    } <= set(body)
    assert "never accepts arbitrary shell commands" in body["note"]
    assert "pytest" in body["suites"]["backend"]
    assert "Playwright" in body["suites"]["browser"]


def test_runner_is_forbidden_when_disabled(client, admin_headers, accounts):
    response = client.post("/api/tests/run", headers=admin_headers)
    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]

    viewer = client.post("/api/tests/run", headers=accounts["viewer"]["headers"])
    assert viewer.status_code == 403


def test_suite_mapping():
    assert _suite_for("tests.test_auth") == "Authentication API"
    assert _suite_for("tests.test_monitoring.TestX") == "Monitoring Engine"
    assert _suite_for("tests.test_anomaly") == "AI Anomaly Detection"
    assert _suite_for("tests.test_unknown") == "Backend API"


def test_junit_parser_handles_all_statuses(tmp_path: Path):
    xml = tmp_path / "junit.xml"
    xml.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="pytest" tests="3">
    <testcase classname="tests.test_auth" name="test_ok" time="0.125" />
    <testcase classname="tests.test_monitoring" name="test_bad" time="0.5">
      <failure message="Expected 200, got 500">traceback</failure>
    </testcase>
    <testcase classname="tests.test_reports" name="test_skip" time="0.0">
      <skipped message="environment requirement" />
    </testcase>
  </testsuite>
</testsuites>
""",
        encoding="utf-8",
    )
    results = _parse_junit(xml)
    assert len(results) == 3
    by_name = {item["test_name"]: item for item in results}
    assert by_name["tests.test_auth::test_ok"]["status"] == "passed"
    assert by_name["tests.test_auth::test_ok"]["duration_ms"] == 125.0
    assert by_name["tests.test_monitoring::test_bad"]["status"] == "failed"
    assert "Expected 200" in by_name["tests.test_monitoring::test_bad"]["details"]
    assert by_name["tests.test_reports::test_skip"]["status"] == "skipped"
    assert by_name["tests.test_auth::test_ok"]["suite"] == "Authentication API"


def test_no_active_run_after_startup(db):
    assert current_run() is None
    assert isinstance(persisted_runs(db), list)


def test_missing_run_returns_404(client, admin_headers):
    response = client.get("/api/tests/runs/run-does-not-exist", headers=admin_headers)
    assert response.status_code == 404
