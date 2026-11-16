"""PDF report generation and secure download endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.schemas.schemas import ReportGenerateRequest, ReportOut
from app.services.reports import REPORT_TITLES, generate_pdf_report, list_reports, resolve_report_path

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=list[ReportOut])
def reports(_: CurrentUser) -> list[dict]:
    return list_reports()


@router.get("/types")
def report_types(_: CurrentUser) -> list[dict]:
    return [{"type": key, "title": title} for key, title in REPORT_TITLES.items()]


@router.post("/generate", response_model=ReportOut)
def generate(payload: ReportGenerateRequest, db: DbSession, _: AnalystUser) -> dict:
    try:
        return generate_pdf_report(db, payload.report_type, payload.hours)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/download/{filename}")
def download(filename: str, _: CurrentUser):
    try:
        path = resolve_report_path(filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid report filename") from None
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
        headers={"Cache-Control": "private, no-store"},
    )
