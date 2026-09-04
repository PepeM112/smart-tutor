from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.assist import AssistRequest
from app.services.assist_service import stream_assist

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("")
def assist(data: AssistRequest, db: DbSession, current_user: CurrentUser) -> StreamingResponse:
    return StreamingResponse(
        stream_assist(db, current_user=current_user, request=data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
