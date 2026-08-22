from typing import Annotated, TypeAlias

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.enums import AIFeature
from app.crud.token_usage import UsageGroupBy
from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.token_usage import TokenUsageSummaryResponse
from app.services import token_usage_service

router = APIRouter()

DbSession: TypeAlias = Annotated[Session, Depends(get_session)]
CurrentUser: TypeAlias = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=TokenUsageSummaryResponse)
def get_usage(
    db: DbSession,
    current_user: CurrentUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    group_by: Annotated[UsageGroupBy, Query(alias="groupBy")] = "provider",
    feature: Annotated[AIFeature | None, Query()] = None,
) -> TokenUsageSummaryResponse:
    return token_usage_service.get_usage_summary(
        db, user_id=current_user.id, days=days, group_by=group_by, feature_filter=feature
    )
