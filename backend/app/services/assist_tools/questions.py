"""Question tools: search the question bank and refine questions of a test."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.core.enums import QuestionType
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.schemas.test_generation import GeneratedQuestionPreview, QuestionEditRequest
from app.services import test_generation_service
from app.services.assist_tools._helpers import SEARCH_LIMIT, clip, confirm_summary, string_list
from app.services.assist_tools.types import QuestionRefineMetadata, ToolResult, ToolSpec
from app.services.service_helpers import get_owned_or_404

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.question import Question
    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")


def search_questions(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    questions, total = question_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=SEARCH_LIMIT)
    if not questions:
        return ToolResult(output="No questions found.")
    lines = [f"Found {total} question(s):"]
    for q in questions:
        test = q.owning_test
        test_label = f"in test `{test.id}`" if test else "in Question Bank"
        lines.append(f"- [{QuestionType(q.question_type).name}] {q.prompt} ({test_label}, ID: `{q.id}`)")
    return ToolResult(output="\n".join(lines))


def _question_to_preview(q: Question) -> GeneratedQuestionPreview:
    return GeneratedQuestionPreview(
        question_type=QuestionType(q.question_type),
        prompt=q.prompt,
        points=q.points,
        content=q.content,  # type: ignore[arg-type]  # JSONB dict validated by Pydantic at runtime
    )


def refine_questions(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    test_id = str(arguments.get("test_id", ""))
    raw_question_ids = arguments.get("question_ids")
    question_ids = {str(qid) for qid in raw_question_ids} if isinstance(raw_question_ids, list) else set()
    instructions = str(arguments.get("instructions", ""))

    logger.info("refine_questions: user=%s test=%s question_ids=%s", current_user.id, test_id, question_ids)
    test = get_owned_or_404(db, fetch=test_crud.get_by_id, id=test_id, current_user=current_user, entity_name="Test")

    ordered_questions: list[Question] = sorted(test.questions or [], key=lambda q: q.order)
    for g in sorted(test.question_groups or [], key=lambda g: g.order):
        ordered_questions.extend(sorted(g.questions or [], key=lambda q: q.order))

    all_questions: list[GeneratedQuestionPreview] = [_question_to_preview(q) for q in ordered_questions]
    selected_indices = [i for i, q in enumerate(ordered_questions) if q.id in question_ids]

    if not selected_indices:
        logger.warning("refine_questions: no matching question IDs found in test=%s", test_id)
        return ToolResult(output="Error: None of the specified question IDs were found in this test.")

    logger.info("refine_questions: selected_indices=%s for test=%s", selected_indices, test_id)
    result = test_generation_service.edit_test_questions(
        db,
        current_user=current_user,
        data=QuestionEditRequest(
            selected_indices=selected_indices,
            all_questions=all_questions,
            instructions=instructions,
        ),
    )

    return ToolResult(
        output=f"Question refinement ready for review ({len(selected_indices)} question(s)).",
        metadata=QuestionRefineMetadata(
            test_id=test_id,
            questions=result.questions,
            selected_indices=selected_indices,
        ),
    )


def refine_questions_confirm_context(
    db: Session, *, current_user: User, arguments: dict[str, Any]
) -> dict[str, Any] | None:
    test_id = arguments.get("test_id")
    test = test_crud.get_by_id(db, id=str(test_id)) if test_id else None
    owned = test is not None and test.user_id == current_user.id
    count = len(string_list(arguments.get("question_ids")))
    return confirm_summary(
        ("test", test.title if test and owned else None),
        ("questions", str(count) if count else None),
        ("instructions", clip(arguments.get("instructions"))),
    )


SEARCH_QUESTIONS = ToolSpec(
    name="search_questions",
    description="Search the user's question bank.",
    input_schema={
        "type": "object",
        "properties": {
            "search": {
                "type": "string",
                "description": "Search term to filter questions by prompt text.",
            },
        },
        "required": [],
    },
    handler=search_questions,
    kind="read",
)

REFINE_QUESTIONS = ToolSpec(
    name="refine_questions",
    description=(
        "Edit the content of specific questions in a test using AI. "
        "Use get_test_details first to see the test's questions. "
        "The user may be asked to approve the call first; after it runs, the user reviews the proposed "
        "changes in a diff view before accepting."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "test_id": {
                "type": "string",
                "description": "ID of the test containing the questions.",
            },
            "question_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs of questions to edit (use qid values from get_test_details).",
            },
            "instructions": {
                "type": "string",
                "description": "Instructions for how to edit the questions.",
            },
        },
        "required": ["test_id", "question_ids", "instructions"],
    },
    handler=refine_questions,
    confirm_context=refine_questions_confirm_context,
    kind="write",
)
