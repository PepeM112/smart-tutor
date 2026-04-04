from typing import List

from sqlalchemy.orm import Session

from app.crud import question as question_crud
from app.models.test_question_group import TestQuestionGroup
from app.schemas.test_question_group import TestQuestionGroupCreate


def create_many(
    db: Session,
    *,
    test_id: str,
    groups: List[TestQuestionGroupCreate],
) -> List[TestQuestionGroup]:
    result: list[TestQuestionGroup] = []
    for group_data in groups:
        group = TestQuestionGroup(
            test_id=test_id,
            type=int(group_data.type),
            order=group_data.order,
            title=group_data.title,
        )
        db.add(group)
        db.flush()  # assigns the group.id so nested questions can reference it

        if group_data.questions:
            question_crud.create_many(db, questions=group_data.questions, group_id=group.id)

        result.append(group)

    return result
