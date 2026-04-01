from typing import List, Optional
from uuid import UUID

from app.schemas.base import BaseSchema
from app.schemas.question import QuestionCreate, QuestionRead


class TestBase(BaseSchema):
    title: str
    description: Optional[str] = None


class TestCreate(TestBase):
    questions: List[QuestionCreate] = []


class TestUpdate(BaseSchema):
    title: Optional[str] = None
    description: Optional[str] = None
    questions: List[QuestionCreate] = []


class TestRead(TestBase):
    id: UUID
    user_id: UUID
    questions: List[QuestionRead] = []
