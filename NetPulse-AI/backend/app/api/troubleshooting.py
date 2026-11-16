"""Rule-based troubleshooting endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.schemas.schemas import TroubleshootingOut, TroubleshootingRequest
from app.troubleshooting.engine import generate_recommendation, recent_recommendations

router = APIRouter(prefix="/troubleshooting", tags=["Smart Troubleshooting"])


@router.get("", response_model=list[TroubleshootingOut])
def list_recommendations(
    db: DbSession, _: CurrentUser, limit: int = Query(default=30, ge=1, le=200)
) -> list:
    return recent_recommendations(db, limit=limit)


@router.post("/run", response_model=TroubleshootingOut)
def run_diagnosis(payload: TroubleshootingRequest, db: DbSession, _: AnalystUser):
    if payload.access_point_id is not None:
        from app.models import AccessPoint

        if db.get(AccessPoint, payload.access_point_id) is None:
            raise HTTPException(status_code=404, detail="Access point not found")
    return generate_recommendation(db, payload.access_point_id)


@router.get("/latest", response_model=TroubleshootingOut | None)
def latest(db: DbSession, _: CurrentUser):
    rows = recent_recommendations(db, limit=1)
    return rows[0] if rows else None
