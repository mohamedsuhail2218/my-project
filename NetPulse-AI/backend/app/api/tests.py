"""Automated test-run control and result APIs."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models import AutomatedTestResult
from app.schemas.schemas import TestResultOut, TestRunResponse
from app.services.test_runner import (
    current_run,
    persisted_runs,
    run_status,
    start_test_run,
)

router = APIRouter(prefix="/tests", tags=["Automated Testing"])


@router.get("")
def testing_dashboard(
    db: DbSession,
    _: CurrentUser,
    run_id: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=200, ge=1, le=2000),
) -> dict:
    runs = persisted_runs(db, limit=20)
    active = current_run()
    if active and all(item["run_id"] != active["run_id"] for item in runs):
        runs.insert(0, {**active, "total": 0, "passed": 0, "failed": 0, "skipped": 0, "duration_ms": 0})
    selected_run = run_id or (runs[0]["run_id"] if runs else None)
    query = select(AutomatedTestResult)
    if selected_run:
        query = query.where(AutomatedTestResult.run_id == selected_run)
    results = db.scalars(
        query.order_by(AutomatedTestResult.suite, AutomatedTestResult.test_name).limit(limit)
    ).all()
    passed = sum(1 for row in results if row.status == "passed")
    failed = sum(1 for row in results if row.status == "failed")
    skipped = sum(1 for row in results if row.status == "skipped")
    return {
        "results": [TestResultOut.model_validate(row) for row in results],
        "runs": runs,
        "current_run": active,
        "latest_run_id": selected_run,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "suites": {
            "backend": "pytest API, authentication, monitoring, ML, tickets, reports",
            "browser": "Playwright end-to-end UI suite (see frontend/e2e and reports/playwright-report)",
        },
        "note": (
            "The built-in runner executes only the repository's fixed pytest suite. "
            "It never accepts arbitrary shell commands."
        ),
    }


@router.post("/run", response_model=TestRunResponse, status_code=202)
def run_tests(_: AdminUser) -> TestRunResponse:
    try:
        run_id = start_test_run()
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return TestRunResponse(run_id=run_id, status="running", message="Backend pytest run started")


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: DbSession, _: CurrentUser) -> dict:
    live = run_status(run_id)
    results = db.scalars(
        select(AutomatedTestResult).where(AutomatedTestResult.run_id == run_id)
    ).all()
    if live is None and not results:
        raise HTTPException(status_code=404, detail="Test run not found")
    return {
        "run": live
        or {
            "run_id": run_id,
            "status": "passed" if all(r.status != "failed" for r in results) else "failed",
            "summary": {
                "passed": sum(1 for r in results if r.status == "passed"),
                "failed": sum(1 for r in results if r.status == "failed"),
                "skipped": sum(1 for r in results if r.status == "skipped"),
                "total": len(results),
            },
        },
        "results": [TestResultOut.model_validate(row) for row in results],
    }
