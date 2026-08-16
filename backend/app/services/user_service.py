import bcrypt as bcrypt_lib
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import UserStatus
from app.crud import user as user_crud
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.services.encryption import encrypt


def _hash_password(password: str) -> str:
    return bcrypt_lib.hashpw(password.encode(), bcrypt_lib.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt_lib.checkpw(plain.encode(), hashed.encode())


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = user_crud.get_by_email(db, email=email)
    if not user or not _verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user


def create_user(db: Session, user_in: UserCreate) -> User:
    if user_crud.get_by_email(db, email=user_in.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )
    if user_crud.get_by_username(db, username=user_in.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this username already exists.",
        )
    user = user_crud.create(
        db, username=user_in.username, email=user_in.email, hashed_password=_hash_password(user_in.password)
    )
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, *, current_user: User, data: UserUpdate) -> User:
    update_data = data.model_dump(exclude_unset=True)

    if "anthropic_api_key" in update_data:
        key = update_data.pop("anthropic_api_key")
        # Empty/falsy key clears the stored credential instead of encrypting an empty string
        update_data["encrypted_anthropic_key"] = encrypt(key) if key else None
    if "openai_api_key" in update_data:
        key = update_data.pop("openai_api_key")
        update_data["encrypted_openai_key"] = encrypt(key) if key else None

    if not update_data:
        return current_user

    updated = user_crud.update(db, user=current_user, data=update_data)
    db.commit()
    db.refresh(updated)
    return updated
