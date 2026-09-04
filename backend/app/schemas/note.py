from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.enums import NoteLength, NoteSource
from app.schemas.base import BaseSchema
from app.schemas.pagination import PaginatedResponse


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
    is_indexed: bool
    created_at: datetime
    updated_at: datetime


class NoteGenerate(BaseSchema):
    topic: str = Field(max_length=200)
    guidance: str | None = None
    length: NoteLength | None = None


class NoteRefine(BaseSchema):
    instructions: str = Field(..., min_length=1, max_length=2000)


class NoteChunkEdit(BaseSchema):
    full_text: str = Field(..., min_length=1)
    selected_text: str = Field(..., min_length=1)
    instructions: str = Field(..., min_length=1, max_length=2000)


class NoteChunkEditResponse(BaseSchema):
    edited_text: str


NoteSortBy = Literal["title", "updated_at", "created_at"]
SortOrder = Literal["asc", "desc"]

PaginatedNoteRead = PaginatedResponse[NoteRead]
