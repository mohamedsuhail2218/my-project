"""Request models for the intelligence, notification and live APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RCARequest(BaseModel):
    measurement_id: int | None = Field(default=None, ge=1)
    access_point_id: int | None = Field(default=None, ge=1)


class StatusUpdate(BaseModel):
    status: Literal["Open", "Acknowledged", "Resolved", "Advisory", "Planned", "Dismissed"]


class NotificationReadRequest(BaseModel):
    notification_ids: list[int] = Field(default_factory=list)
