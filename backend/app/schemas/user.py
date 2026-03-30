from uuid import UUID

from app.core.base_schema import BaseSchema
from app.core.enums import UserStatus


class UserBase(BaseSchema):
    username: str
    email: str
    status: UserStatus = UserStatus.ACTIVE


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: UUID
