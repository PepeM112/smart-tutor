from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token
from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserRead
from app.services import user_service

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]


@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate, db: DbSession) -> User:
    """Crea un nuevo usuario en la plataforma."""
    return user_service.create_user(db, user_in=user_in)


@router.post("/login", response_model=UserRead)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    db: DbSession,
) -> User:
    """Autentica al usuario y devuelve un JWT en una cookie HTTP-only."""
    user = user_service.authenticate_user(db, username=form_data.username, password=form_data.password)
    token = create_access_token(str(user.id))
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return user


@router.get("/me", response_model=UserRead)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """Devuelve el usuario autenticado actual."""
    return current_user
