from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_session
from app.models.user import User, UserCreate, UserRead
from app.services import user_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]


@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate, db: DbSession) -> User:
    """Crea un nuevo usuario en la plataforma."""
    return user_service.create_user(db, user_in=user_in)
