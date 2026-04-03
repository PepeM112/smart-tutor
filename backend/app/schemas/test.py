from typing import List, Optional

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
    id: str
    user_id: str
    questions: List[QuestionRead] = []
