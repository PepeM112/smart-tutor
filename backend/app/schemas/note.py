from datetime import datetime

from pydantic import Field

from app.core.enums import NoteLength, NoteSource
from app.schemas.base import BaseSchema


class NoteBase(BaseSchema):
    title: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=500)
    content: str = ""
    tags: list[str] = []


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseSchema):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    content: str | None = None
    tags: list[str] | None = None


class NoteRead(NoteBase):
    id: str
    user_id: str
    source: NoteSource
    created_at: datetime
    updated_at: datetime


class NoteGenerate(BaseSchema):
    topic: str = Field(max_length=200)
    guidance: str | None = None
    length: NoteLength | None = None


class NoteRefine(BaseSchema):
    instructions: str = Field(..., min_length=1, max_length=2000)
