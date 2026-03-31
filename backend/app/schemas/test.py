from typing import Optional
from uuid import UUID

from app.schemas.base import BaseSchema


class TestBase(BaseSchema):
    title: str
    description: Optional[str] = None
    user_id: UUID


class TestCreate(TestBase):
    pass


class TestRead(TestBase):
    id: UUID
