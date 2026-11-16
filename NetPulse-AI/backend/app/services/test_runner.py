"""Allow-listed pytest execution and persisted automated test reporting."""

from __future__ import annotations

import logging
import os
import secrets
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

from sqlalchemy import distinct, select

from app.core.config import BACKEND_DIR, PROJECT_DIR, settings
from app.core.database import SessionLocal
from app.models import AutomatedTestResult

logger = logging.getLogger("netpulse.tests")

_RUNS: dict[str, dict] = {}
_LOCK = threading.Lock()
_ACTIVE_RUN: str | None = None
TEST_REPORTS = Path(PROJECT_DIR) / "reports" / "test-runs"


def _new_run_id() -> str:
    return f"run-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}"


def start_test_run() -> str:
    global _ACTIVE_RUN
    if not settings.test_runner_enabled:
        raise PermissionError("The automated test runner is disabled by configuration")
    with _LOCK:
        if _ACTIVE_RUN and _RUNS.get(_ACTIVE_RUN, {}).get("status") == "running":
            raise RuntimeError("An automated test run is already in progress")
        run_id = _new_run_id()
        _ACTIVE_RUN = run_id
        _RUNS[run_id] = {
            "run_id": run_id,
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
            "return_code": None,
            "summary": None,
        }
    thread = threading.Thread(target=_execute_run, args=(run_id,), daemon=True, name=f"netpulse-{run_id}")
    thread.start()
    return run_id


def _suite_for(classname: str) -> str:
    mapping = {
        "test_auth": "Authentication API",
        "test_dashboard": "Dashboard API",
        "test_monitoring": "Monitoring Engine",
        "test_access_points": "Access Point API",
        "test_anomaly": "AI Anomaly Detection",
        "test_tickets": "Issue Management",
        "test_reports": "Reports",
        "test_devices": "Device Monitoring",
        "test_troubleshooting": "Troubleshooting Engine",
    }
    filename = classname.split(".")[-1]
    if filename in mapping:
        return mapping[filename]
    # pytest emits class-qualified names for tests grouped in a class, e.g.
    # tests.test_monitoring.TestScheduler.test_status.
    for part in reversed(classname.split(".")):
        if part in mapping:
            return mapping[part]
    return "Backend API"


def _parse_junit(xml_path: Path) -> list[dict]:
    tree = ElementTree.parse(xml_path)
    cases = []
    for case in tree.iter("testcase"):
        duration = float(case.attrib.get("time", 0.0) or 0.0) * 1000
        failure = case.find("failure")
        error = case.find("error")
        skipped = case.find("skipped")
        status = "passed"
        details = None
        if failure is not None or error is not None:
            status = "failed"
            node = failure if failure is not None else error
            details = (node.attrib.get("message") or node.text or "Test failed")[:2000]
        elif skipped is not None:
            status = "skipped"
            details = (skipped.attrib.get("message") or skipped.text or "Skipped")[:1000]
        classname = case.attrib.get("classname", "")
        cases.append(
            {
                "suite": _suite_for(classname),
                "test_name": f"{classname}::{case.attrib.get('name', 'unnamed')}".strip(":"),
                "status": status,
                "duration_ms": round(duration, 2),
                "details": details,
            }
        )
    return cases


def _execute_run(run_id: str) -> None:
    global _ACTIVE_RUN
    TEST_REPORTS.mkdir(parents=True, exist_ok=True)
    xml_path = TEST_REPORTS / f"{run_id}-junit.xml"
    command = [
        sys.executable,
        "-m",
        "pytest",
        "tests",
        "-q",
        f"--junitxml={xml_path}",
        "-p",
        "no:cacheprovider",
    ]
    env = os.environ.copy()
    env["NETPULSE_TEST_SUBPROCESS"] = "1"
    env["ENVIRONMENT"] = "testing"
    env["MONITORING_ENABLED"] = "false"
    env["MONITOR_ON_STARTUP"] = "false"
    env["TEST_RUNNER_ENABLED"] = "false"
    env["PYTHONPATH"] = str(BACKEND_DIR)
    started = datetime.now(timezone.utc)
    output = ""
    return_code = None
    try:
        completed = subprocess.run(
            command,
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=240,
            shell=False,
            check=False,
        )
        output = f"{completed.stdout}\n{completed.stderr}"[-6000:]
        return_code = completed.returncode
    except subprocess.TimeoutExpired as exc:
        output = f"Test run exceeded 240 seconds.\n{exc.stdout or ''}\n{exc.stderr or ''}"[-6000:]
        return_code = -1
    except Exception as exc:
        output = f"Unable to execute pytest: {type(exc).__name__}: {exc}"
        return_code = -1

    results: list[dict] = []
    if xml_path.exists():
        try:
            results = _parse_junit(xml_path)
        except Exception as exc:
            output += f"\nCould not parse JUnit output: {exc}"
    if not results:
        results = [
            {
                "suite": "Backend API",
                "test_name": "pytest execution",
                "status": "failed",
                "duration_ms": round((datetime.now(timezone.utc) - started).total_seconds() * 1000, 2),
                "details": output[-3000:] or "pytest produced no test results",
            }
        ]

    passed = sum(1 for item in results if item["status"] == "passed")
    failed = sum(1 for item in results if item["status"] == "failed")
    skipped = sum(1 for item in results if item["status"] == "skipped")
    try:
        with SessionLocal() as db:
            for item in results:
                db.add(
                    AutomatedTestResult(
                        run_id=run_id,
                        suite=item["suite"],
                        test_name=item["test_name"],
                        status=item["status"],
                        duration_ms=item["duration_ms"],
                        details=item["details"],
                        executed_at=started,
                    )
                )
            db.commit()
    except Exception:
        logger.exception("Could not persist automated test results")

    finished = datetime.now(timezone.utc)
    with _LOCK:
        _RUNS[run_id]["status"] = "passed" if failed == 0 and return_code == 0 else "failed"
        _RUNS[run_id]["finished_at"] = finished.isoformat()
        _RUNS[run_id]["return_code"] = return_code
        _RUNS[run_id]["summary"] = {
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "total": len(results),
            "duration_seconds": round((finished - started).total_seconds(), 2),
            "output_tail": output[-2000:],
        }
        _ACTIVE_RUN = None
    logger.info("Automated test run %s finished: %s passed, %s failed", run_id, passed, failed)


def run_status(run_id: str) -> dict | None:
    with _LOCK:
        row = _RUNS.get(run_id)
        return dict(row) if row else None


def persisted_runs(db, limit: int = 20) -> list[dict]:
    run_ids = db.scalars(
        select(distinct(AutomatedTestResult.run_id))
        .order_by(AutomatedTestResult.run_id.desc())
        .limit(limit)
    ).all()
    runs = []
    for run_id in run_ids:
        rows = db.scalars(select(AutomatedTestResult).where(AutomatedTestResult.run_id == run_id)).all()
        if not rows:
            continue
        counts = {
            "passed": sum(1 for row in rows if row.status == "passed"),
            "failed": sum(1 for row in rows if row.status == "failed"),
            "skipped": sum(1 for row in rows if row.status == "skipped"),
        }
        status = "passed" if counts["failed"] == 0 else "failed"
        runs.append(
            {
                "run_id": run_id,
                "status": status,
                "executed_at": rows[0].executed_at.isoformat(),
                "total": len(rows),
                "duration_ms": round(sum(row.duration_ms for row in rows), 2),
                **counts,
            }
        )
    return runs


def current_run() -> dict | None:
    with _LOCK:
        if _ACTIVE_RUN:
            row = _RUNS.get(_ACTIVE_RUN)
            return dict(row) if row else None
    return None
