from typing import Generic, TypeVar

from pydantic import Field

from app.schemas.base import BaseSchema

T = TypeVar("T")


class PaginatedResponse(BaseSchema, Generic[T]):
    items: list[T]
    total: int
    page: int = Field(ge=1)
    per_page: int = Field(ge=1)
