from uuid import UUID, uuid4

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserStatus
from app.database import Base
from app.models.base import CreatedAtMixin


class User(Base, CreatedAtMixin):
    __tablename__ = "user"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String, index=True, unique=True)
    email: Mapped[str] = mapped_column(String, index=True, unique=True)
    status: Mapped[UserStatus] = mapped_column(default=UserStatus.ACTIVE)
    hashed_password: Mapped[str] = mapped_column(String)
