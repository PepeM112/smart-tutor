from typing import Annotated, TypeAlias

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
)
from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.models.user import User
from app.schemas.user import AiToolPermissionRead, AiToolPermissionsUpdate, UserCreate, UserRead, UserUpdate
from app.services import ai_permission_service, user_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]

_is_production = settings.environment == "production"


def _set_auth_cookies(response: Response, user_id: str) -> None:
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=_is_production,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=_is_production,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", samesite="lax", secure=_is_production)
    response.delete_cookie(key="refresh_token", samesite="lax", secure=_is_production)


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
) -> User | JSONResponse:
    try:
        user = user_service.get_user_from_refresh_token(db, refresh_token=refresh_token)
    except HTTPException as e:
        # FastAPI drops headers set on the injected `response` when an exception is raised.
        # So build the error response here and clear the bad cookies on it.
        error_response = JSONResponse(status_code=e.status_code, content={"detail": e.detail})
        _clear_auth_cookies(error_response)
        return error_response
    _set_auth_cookies(response, str(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(
    data: UserUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> User:
    return user_service.update_user(db, current_user=current_user, data=data)


@router.get("/me/ai-tool-permissions", response_model=list[AiToolPermissionRead])
def get_ai_tool_permissions(current_user: CurrentUser) -> list[AiToolPermissionRead]:
    return ai_permission_service.list_permissions(current_user)


@router.patch("/me/ai-tool-permissions", response_model=list[AiToolPermissionRead])
def update_ai_tool_permissions(
    data: AiToolPermissionsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> list[AiToolPermissionRead]:
    return ai_permission_service.update_permissions(db, current_user=current_user, data=data)
