from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from app.core.schemas import BaseSchema, CreatedAtMixin, NamedIntEnum


class UserStatus(NamedIntEnum):
    UNKNOWN = 0
    ACTIVE = 1
    DELETED = 2
    BLOCKED = 3


class UserBase(SQLModel, BaseSchema):
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    status: UserStatus = Field(default=UserStatus.ACTIVE)


class User(CreatedAtMixin, UserBase, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    hashed_password: str


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: UUID
