"""Issue management: automatic and manual tickets, comments and state history."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.deps import AnalystUser, CurrentUser, DbSession
from app.models import IssueComment, IssueTicket, User
from app.schemas.schemas import (
    TicketCommentCreate,
    TicketCommentOut,
    TicketCreate,
    TicketOut,
    TicketStats,
    TicketUpdate,
)
from app.services.ticketing import create_ticket

router = APIRouter(prefix="/tickets", tags=["Issue Management"])


def _serialize(ticket: IssueTicket, db) -> TicketOut:
    author_ids = {comment.user_id for comment in ticket.comments if comment.user_id}
    authors = {
        user.id: user.full_name
        for user in db.scalars(select(User).where(User.id.in_(author_ids))).all()
    } if author_ids else {}
    comments = [
        TicketCommentOut(
            id=comment.id,
            ticket_id=comment.ticket_id,
            user_id=comment.user_id,
            comment=comment.comment,
            created_at=comment.created_at,
            author_name=authors.get(comment.user_id) if comment.user_id else "System",
        )
        for comment in ticket.comments
    ]
    return TicketOut(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
        status=ticket.status,
        issue_type=ticket.issue_type,
        fingerprint=ticket.fingerprint,
        source=ticket.source,
        access_point_id=ticket.access_point_id,
        anomaly_event_id=ticket.anomaly_event_id,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        resolved_at=ticket.resolved_at,
        comments=comments,
    )


@router.get("")
def list_tickets(
    db: DbSession,
    _: CurrentUser,
    status_filter: str | None = Query(default=None, alias="status", pattern="^(Open|In Progress|Resolved)$"),
    priority: str | None = Query(default=None, pattern="^(Low|Medium|High|Critical)$"),
    search: str | None = Query(default=None, max_length=160),
) -> dict:
    query = select(IssueTicket)
    if status_filter:
        query = query.where(IssueTicket.status == status_filter)
    if priority:
        query = query.where(IssueTicket.priority == priority)
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            or_(
                IssueTicket.title.ilike(needle),
                IssueTicket.ticket_number.ilike(needle),
                IssueTicket.description.ilike(needle),
            )
        )
    tickets = db.scalars(
        query.order_by(IssueTicket.status.asc(), IssueTicket.created_at.desc()).limit(500)
    ).all()
    counts = {
        value: db.scalar(select(func.count(IssueTicket.id)).where(IssueTicket.status == value)) or 0
        for value in ("Open", "In Progress", "Resolved")
    }
    critical = db.scalar(
        select(func.count(IssueTicket.id)).where(
            IssueTicket.priority == "Critical",
            IssueTicket.status != "Resolved",
        )
    ) or 0
    return {
        "tickets": [_serialize(ticket, db) for ticket in tickets],
        "stats": TicketStats(
            open=counts["Open"],
            in_progress=counts["In Progress"],
            resolved=counts["Resolved"],
            critical=critical,
            total=sum(counts.values()),
        ),
    }


@router.get("/stats", response_model=TicketStats)
def ticket_stats(db: DbSession, _: CurrentUser) -> TicketStats:
    counts = {
        value: db.scalar(select(func.count(IssueTicket.id)).where(IssueTicket.status == value)) or 0
        for value in ("Open", "In Progress", "Resolved")
    }
    critical = db.scalar(
        select(func.count(IssueTicket.id)).where(
            IssueTicket.priority == "Critical", IssueTicket.status != "Resolved"
        )
    ) or 0
    return TicketStats(
        open=counts["Open"],
        in_progress=counts["In Progress"],
        resolved=counts["Resolved"],
        critical=critical,
        total=sum(counts.values()),
    )


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: DbSession, _: CurrentUser) -> TicketOut:
    ticket = db.get(IssueTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return _serialize(ticket, db)


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_manual_ticket(payload: TicketCreate, db: DbSession, user: AnalystUser) -> TicketOut:
    fingerprint = f"manual:{secrets.token_hex(8)}"
    ticket, _ = create_ticket(
        db,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        issue_type=payload.issue_type,
        fingerprint=fingerprint,
        access_point_id=payload.access_point_id,
        source="manual",
    )
    ticket.assigned_to = user.id
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket, db)


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int, payload: TicketUpdate, db: DbSession, _: AnalystUser
) -> TicketOut:
    ticket = db.get(IssueTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"]:
        ticket.status = updates["status"]
        ticket.resolved_at = datetime.now(timezone.utc) if ticket.status == "Resolved" else None
    if "priority" in updates and updates["priority"]:
        ticket.priority = updates["priority"]
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket, db)


@router.post("/{ticket_id}/comments", response_model=TicketCommentOut, status_code=201)
def add_comment(
    ticket_id: int, payload: TicketCommentCreate, db: DbSession, user: AnalystUser
) -> TicketCommentOut:
    ticket = db.get(IssueTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    comment = IssueComment(ticket_id=ticket.id, user_id=user.id, comment=payload.comment.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return TicketCommentOut.model_validate(
        {
            "id": comment.id,
            "ticket_id": comment.ticket_id,
            "user_id": comment.user_id,
            "comment": comment.comment,
            "created_at": comment.created_at,
            "author_name": user.full_name,
        }
    )
