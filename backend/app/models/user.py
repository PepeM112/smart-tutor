from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.schemas import BaseSchema, CreatedAtMixin, NamedIntEnum
from app.database import Base


class UserStatus(NamedIntEnum):
    UNKNOWN = 0
    ACTIVE = 1
    DELETED = 2
    BLOCKED = 3


# --- ORM Model ---


class User(Base, CreatedAtMixin):
    __tablename__ = "user"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String, index=True, unique=True)
    email: Mapped[str] = mapped_column(String, index=True, unique=True)
    status: Mapped[UserStatus] = mapped_column(default=UserStatus.ACTIVE)
    hashed_password: Mapped[str] = mapped_column(String)


# --- Pydantic Schemas ---


class UserBase(BaseModel, BaseSchema):
    username: str
    email: str
    status: UserStatus = UserStatus.ACTIVE


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: UUID
