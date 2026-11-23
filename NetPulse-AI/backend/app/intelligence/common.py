"""Shared helpers for the intelligence engines."""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import fmean, pstdev
from typing import Iterable

SEVERITY_ORDER = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
SEVERITY_LABEL = {4: "Critical", 3: "High", 2: "Medium", 1: "Low"}


def aware(value: datetime | None) -> datetime | None:
    """Return a timezone-aware UTC datetime for SQLite's naive timestamps."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso(value: datetime | None) -> str | None:
    normalised = aware(value)
    return normalised.isoformat() if normalised else None


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def mean(values: Iterable[float]) -> float | None:
    items = [float(value) for value in values if value is not None]
    return round(fmean(items), 2) if items else None


def spread(values: Iterable[float]) -> float | None:
    items = [float(value) for value in values if value is not None]
    return round(pstdev(items), 2) if len(items) > 1 else (0.0 if items else None)


def risk_severity(score: float) -> str:
    if score >= 70:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 30:
        return "Medium"
    return "Low"


def max_severity(severities: Iterable[str]) -> str:
    best = 1
    for severity in severities:
        best = max(best, SEVERITY_ORDER.get(severity, 1))
    return SEVERITY_LABEL[best]


def format_ms(value: float | None) -> str:
    return "not measured" if value is None else f"{value:.1f} ms"


def format_pct(value: float | None) -> str:
    return "not measured" if value is None else f"{value:.2f}%"
