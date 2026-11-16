"""Vercel entrypoint for the NetPulse AI FastAPI application.

Vercel detects a FastAPI instance named ``app`` at this path and routes all
requests to it. The application code lives in ``backend/app`` and keeps its
original ``app.*`` imports, so the backend directory is added to ``sys.path``
before importing the application.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402

__all__ = ["app"]
