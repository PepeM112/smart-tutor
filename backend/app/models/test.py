from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from app.core.schemas import BaseSchema


class TestBase(SQLModel, BaseSchema):
    title: str = Field(index=True)
    description: Optional[str] = None
    user_id: UUID = Field(foreign_key="user.id")


class Test(TestBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
