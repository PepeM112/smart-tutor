from datetime import datetime

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.schemas.error import ErrorCode, ErrorWithCode


class AppError(HTTPException):
    """An `HTTPException` with a stable machine `code`, for the errors that the frontend must tell apart.

    A subclass, so code that catches `HTTPException` still works. The handler writes
    `{"detail", "code", ...}`. An `HTTPException` without a code keeps the plain `{"detail"}` body.
    """

    def __init__(
        self,
        status_code: int,
        detail: str,
        code: ErrorCode,
        *,
        next_attempt_at: datetime | None = None,
        max_points: float | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.body = ErrorWithCode(detail=detail, code=code, next_attempt_at=next_attempt_at, max_points=max_points)


async def app_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    # Starlette types handlers as `Exception`; only `AppError` is registered for this one.
    if not isinstance(exc, AppError):
        raise exc
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.body.model_dump(mode="json", by_alias=True, exclude_none=True),
        headers=exc.headers,
    )
