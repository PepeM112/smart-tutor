from typing import Generic, TypeVar

from pydantic import Field

from app.schemas.base import BaseSchema

T = TypeVar("T")


class PaginatedResponse(BaseSchema, Generic[T]):
    items: list[T]
    total: int
    page: int = Field(ge=1)
    per_page: int = Field(ge=1)


class CursorPage(BaseSchema, Generic[T]):
    """A page of a cursor-paginated, newest-first list (the Stream feed, notifications).

    Every row id is a ULID, which sorts lexicographically by creation time, so the id of the
    last item returned is itself a valid cursor (`WHERE id < next_cursor`) -- no separate
    timestamp column is needed. `next_cursor` is None when there is no next page.
    """

    items: list[T]
    next_cursor: str | None
