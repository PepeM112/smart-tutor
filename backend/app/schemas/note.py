from datetime import datetime

from app.core.enums import NoteLength, NoteSource
from app.schemas.base import BaseSchema


class NoteBase(BaseSchema):
    title: str
    content: str = ""


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseSchema):
    title: str | None = None
    content: str | None = None


class NoteRead(NoteBase):
    id: str
    user_id: str
    source: NoteSource
    created_at: datetime
    updated_at: datetime


class NoteGenerate(BaseSchema):
    topic: str
    guidance: str | None = None
    length: NoteLength | None = None
