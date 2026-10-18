from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_session
from app.dependencies.auth import CurrentUser
from app.schemas.assist import AssistRequest
from app.services.assist_service import stream_assist
from app.services.space_attempt_service import require_no_open_attempt

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]


@router.post("")
def assist(data: AssistRequest, db: DbSession, current_user: CurrentUser) -> StreamingResponse:
    # Check before the stream starts, so the client gets a normal 409 and not a broken stream.
    require_no_open_attempt(db, user=current_user)
    return StreamingResponse(
        stream_assist(db, current_user=current_user, request=data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
