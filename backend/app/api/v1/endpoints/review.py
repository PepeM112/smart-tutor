from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.user_question_state import ReviewMode, ReviewResponse
from app.services import review_service
from app.services.question_helpers import build_stripped_question

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


@router.get("/questions", response_model=ReviewResponse)
def list_(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=10, ge=1, le=50),
    mode: Annotated[ReviewMode, Query()] = "review",
) -> ReviewResponse:
    """Fetch questions for review. SRS-prioritised by default, random in practice mode."""
    questions, has_questions = review_service.get_review_questions(
        db, current_user=current_user, limit=limit, mode=mode
    )
    return ReviewResponse(
        questions=[build_stripped_question(q) for q in questions],
        has_questions=has_questions,
    )
