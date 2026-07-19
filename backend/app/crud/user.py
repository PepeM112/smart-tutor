from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_by_id(db: Session, *, id: str) -> User | None:
    return db.scalars(select(User).where(User.id == id)).first()


def get_by_email(db: Session, *, email: str) -> User | None:
    return db.scalars(select(User).where(User.email == email)).first()


def get_by_username(db: Session, *, username: str) -> User | None:
    return db.scalars(select(User).where(User.username == username)).first()


def create(db: Session, *, username: str, email: str, hashed_password: str) -> User:
    user = User(username=username, email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update(db: Session, *, user: User, data: dict[str, Any]) -> User:
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
