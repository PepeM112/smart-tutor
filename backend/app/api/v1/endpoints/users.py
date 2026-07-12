from typing import Annotated, TypeAlias

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.crud import user as user_crud
from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserRead
from app.services import user_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]


def _set_auth_cookies(response: Response, user_id: str) -> None:
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")


@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate, db: DbSession) -> User:
    return user_service.create_user(db, user_in=user_in)


@router.post("/login", response_model=UserRead)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    response: Response,
    db: DbSession,
) -> User:
    user = user_service.authenticate_user(db, email=form_data.username, password=form_data.password)
    _set_auth_cookies(response, str(user.id))
    return user


@router.post("/refresh", response_model=UserRead)
def refresh(
    response: Response,
    db: DbSession,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> User:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        user_id = decode_refresh_token(refresh_token)
    except JWTError as e:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from e
    user = user_crud.get_by_id(db, id=user_id)
    if user is None:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    _set_auth_cookies(response, str(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserRead)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
