from typing import Annotated, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.question import QuestionReadStripped
from app.services import review_service
from app.services.question_helpers import build_stripped_question

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/questions", response_model=List[QuestionReadStripped])
def list(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=10, ge=1, le=50),
) -> list:
    """Fetch a random batch of questions for review (answers stripped)."""
    questions = review_service.get_review_questions(db, current_user=current_user, limit=limit)
    return [build_stripped_question(q) for q in questions]
