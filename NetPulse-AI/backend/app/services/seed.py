"""First-run database seeding.

No production password is embedded in source code. In development, if no
bootstrap password is configured, a random one is generated and printed once.
"""

from __future__ import annotations

import logging
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import AccessPoint, User
from app.services.settings import ensure_default_settings

logger = logging.getLogger("netpulse.seed")


def seed_database(db: Session) -> None:
    """Seed first-run rows and commit them as one unit.

    The caller holds the database startup lock, so a concurrent cold start can
    never observe a half-seeded database or create a duplicate administrator.
    """
    ensure_default_settings(db)
    admin = _ensure_admin(db)
    _seed_demo_access_points(db, admin)
    db.commit()
    logger.info("Database seed check complete")


def _ensure_admin(db: Session) -> User | None:
    count = db.scalar(select(func.count(User.id))) or 0
    if count:
        return db.scalar(select(User).order_by(User.id.asc()))

    email = settings.admin_email.strip().lower()
    if not email:
        email = "admin@netpulse.ai"
    password = settings.admin_password
    using_generated_password = False
    if not password or password.startswith("REPLACE_"):
        password = secrets.token_urlsafe(12)
        using_generated_password = True

    user = User(
        email=email,
        full_name=settings.admin_full_name,
        password_hash=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.refresh(user)
    if using_generated_password:
        logger.warning("=" * 72)
        logger.warning("NetPulse AI initial administrator created")
        logger.warning("Email: %s", email)
        logger.warning("Temporary password: %s", password)
        logger.warning("Set ADMIN_PASSWORD in backend/.env before first launch to control this.")
        logger.warning("=" * 72)
    else:
        logger.info("Initial administrator created for %s", email)
    return user


def _seed_demo_access_points(db: Session, admin: User | None) -> None:
    """Create clearly labelled simulated AP records for college demonstrations.

    These records never have fabricated live measurements and are excluded from
    network health calculations. Administrators can delete them at any time.
    """
    count = db.scalar(select(func.count(AccessPoint.id))) or 0
    if count:
        return
    samples = [
        AccessPoint(
            name="[DEMO] Library Floor 2",
            location="College Library, Floor 2",
            ip_address="192.0.2.12",
            vendor="Simulated (RFC 5737 documentation range)",
            model="NP-DemoAP-6E",
            is_simulated=True,
            status="simulated",
            notes="Clearly labelled demonstration AP. No live measurements are attributed to it.",
            created_by=admin.id if admin else None,
        ),
        AccessPoint(
            name="[DEMO] Computer Lab A",
            location="CS Department, Lab A",
            ip_address="192.0.2.22",
            vendor="Simulated (RFC 5737 documentation range)",
            model="NP-DemoAP-6E",
            is_simulated=True,
            status="simulated",
            notes="Use Add Access Point to register a real authorized AP.",
            created_by=admin.id if admin else None,
        ),
    ]
    db.add_all(samples)
    db.flush()
    logger.info("Seeded %s clearly-labelled simulated access points", len(samples))
