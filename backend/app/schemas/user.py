from uuid import UUID

from app.core.enums import UserStatus
from app.schemas.base import BaseSchema


class UserBase(BaseSchema):
    username: str
    email: str


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: UUID
    status: UserStatus
