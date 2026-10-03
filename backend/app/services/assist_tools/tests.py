"""Test tools: list, read, create (from a note) and edit tests."""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any

from app.core.enums import QuestionType
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.schemas.question import QuestionCreate
from app.schemas.test import TestCreate, TestUpdate
from app.schemas.test_generation import TestGenerationRequest
from app.services import question_service, test_generation_service, test_service
from app.services.assist_tools._helpers import LIST_LIMIT
from app.services.assist_tools.types import TestCreatedMetadata, TestEditMetadata, ToolResult, ToolSpec
from app.services.service_helpers import get_owned_or_404

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def list_tests(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    tests, total = test_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=LIST_LIMIT)
    if not tests:
        return ToolResult(output="No tests found.")
    lines = [f"Found {total} test(s):"]
    for t in tests:
        q_count = len(t.questions or []) + sum(len(g.questions or []) for g in (t.question_groups or []))
        lines.append(f"- **{t.title}** ({q_count} questions, ID: `{t.id}`)")
    return ToolResult(output="\n".join(lines))


def get_test_details(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    test_id = str(arguments.get("test_id", ""))
    test = get_owned_or_404(db, fetch=test_crud.get_by_id, id=test_id, current_user=current_user, entity_name="Test")
    lines = [f"**{test.title}** (ID: `{test.id}`)"]
    if test.description:
        lines.append(test.description)
    lines.append("")
    idx = 1
    for q in sorted(test.questions or [], key=lambda q: q.order):
        lines.append(f"{idx}. [{QuestionType(q.question_type).name}] {q.prompt} (qid: `{q.id}`)")
        idx += 1
    for g in sorted(test.question_groups or [], key=lambda g: g.order):
        lines.append(f"\n**Group: {g.title}**")
        for q in sorted(g.questions or [], key=lambda q: q.order):
            lines.append(f"{idx}. [{QuestionType(q.question_type).name}] {q.prompt} (qid: `{q.id}`)")
            idx += 1
    if idx == 1:
        lines.append("(no questions)")
    return ToolResult(output="\n".join(lines))


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def create_test(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    raw_count = arguments.get("question_count", 10)
    try:
        question_count = int(raw_count) if isinstance(raw_count, (int, str)) else 10
    except (TypeError, ValueError):
        question_count = 10
    question_count = max(5, min(30, question_count))

    raw_types = arguments.get("question_types", ["SIMPLE", "MULTIPLE_CHOICE"])
    if not isinstance(raw_types, list):
        raw_types = ["SIMPLE", "MULTIPLE_CHOICE"]
    q_types = []
    for t in raw_types:
        with contextlib.suppress(KeyError):
            q_types.append(QuestionType[str(t)])
    if not q_types:
        q_types = [QuestionType.SIMPLE, QuestionType.MULTIPLE_CHOICE]

    difficulty = str(arguments.get("difficulty", "medium"))
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    logger.info("create_test: user=%s note=%s count=%d types=%s", current_user.id, note_id, question_count, q_types)
    gen_request = TestGenerationRequest(
        note_id=note_id,
        question_count=question_count,
        question_types=q_types,
        difficulty=difficulty,
    )
    gen_result = test_generation_service.generate_test_questions(
        db,
        current_user=current_user,
        data=gen_request,
    )

    questions = [
        QuestionCreate(
            question_type=q.question_type,
            prompt=q.prompt,
            points=q.points,
            content=q.content,
            order=i,
        )
        for i, q in enumerate(gen_result.questions)
    ]

    title = gen_result.source_note_title or "Generated Test"
    logger.info("create_test: generated %d questions, creating test %r", len(questions), title)
    test = test_service.create_test(
        db,
        current_user=current_user,
        data=TestCreate(
            title=title,
            description=f"Auto-generated from note: {title}",
            questions=questions,
            source_note_id=gen_result.source_note_id,
        ),
    )

    return ToolResult(
        output=(f"Test created successfully!\n- **Title:** {test.title}\n- **Questions:** {len(questions)}"),
        metadata=TestCreatedMetadata(test_id=test.id),
    )


def edit_test(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    test_id = str(arguments.get("test_id", ""))
    logger.info("edit_test: user=%s test=%s", current_user.id, test_id)
    test = test_service.get_test(db, test_id=test_id, current_user=current_user)

    changes: list[str] = []

    new_title = arguments.get("title")
    new_description = arguments.get("description")
    if new_title or new_description:
        update_fields: dict[str, Any] = {}
        if new_title:
            update_fields["title"] = str(new_title)
        if new_description:
            update_fields["description"] = str(new_description)
        update_data = TestUpdate(**update_fields)
        test = test_service.update_test(db, test_id=test_id, current_user=current_user, data=update_data)
        if new_title:
            changes.append(f"Title changed to **{new_title}**")
        if new_description:
            changes.append("Description updated")

    removed_question_ids: list[str] = []
    remove_ids = arguments.get("remove_question_ids")
    if isinstance(remove_ids, list) and remove_ids:
        str_ids = [str(qid) for qid in remove_ids]
        test_question_ids = {q.id for q in test.questions}
        for g in test.question_groups or []:
            test_question_ids.update(q.id for q in g.questions)
        scoped_ids = [qid for qid in str_ids if qid in test_question_ids]
        if scoped_ids:
            removed_question_ids = question_service.bulk_delete_questions(
                db, question_ids=scoped_ids, current_user=current_user, force_soft_delete=True
            )
            changes.append(f"{len(removed_question_ids)} question(s) removed")

    if not changes:
        logger.info("edit_test: no changes for test=%s", test_id)
        return ToolResult(output="No changes specified.")

    logger.info("edit_test: test=%s changes=%s", test_id, changes)
    return ToolResult(
        output=(f"Test edited successfully!\n- **Title:** {test.title}\n- **Changes:** {', '.join(changes)}"),
        metadata=TestEditMetadata(
            test_id=test_id,
            removed_question_ids=removed_question_ids or None,
        ),
    )


def edit_test_confirm_context(db: Session, *, current_user: User, arguments: dict[str, Any]) -> dict[str, Any] | None:
    """Before/after data for the confirm card of `edit_test`."""
    context: dict[str, Any] = {}
    test_id = arguments.get("test_id")
    if test_id:
        test = test_crud.get_by_id(db, id=str(test_id))
        if test and test.user_id == current_user.id:
            new_title = arguments.get("title")
            if new_title:
                context["title_change"] = {"from": test.title, "to": str(new_title)}
            new_desc = arguments.get("description")
            if new_desc:
                context["description_change"] = {
                    "from": test.description or "",
                    "to": str(new_desc),
                }
    remove_ids = arguments.get("remove_question_ids")
    if isinstance(remove_ids, list) and remove_ids:
        questions = question_crud.list_by_ids(db, ids=[str(qid) for qid in remove_ids])
        context["questions_to_remove"] = [
            {"id": q.id, "prompt": q.prompt} for q in questions if q.user_id == current_user.id
        ]
    return context or None


# ---------------------------------------------------------------------------
# Specs
# ---------------------------------------------------------------------------

LIST_TESTS = ToolSpec(
    name="list_tests",
    description="List the user's tests. Returns titles, IDs, and question counts.",
    input_schema={
        "type": "object",
        "properties": {
            "search": {
                "type": "string",
                "description": "Optional search term to filter tests by title.",
            },
        },
        "required": [],
    },
    handler=list_tests,
)

GET_TEST_DETAILS = ToolSpec(
    name="get_test_details",
    description="Get a test's details including its questions.",
    input_schema={
        "type": "object",
        "properties": {
            "test_id": {"type": "string", "description": "The test's ID."},
        },
        "required": ["test_id"],
    },
    handler=get_test_details,
)

CREATE_TEST = ToolSpec(
    name="create_test",
    description=(
        "Generate a test with AI-created questions from an existing note. "
        "Use list_notes first to find the note ID. "
        "Executes directly — the user will see a link to review the generated test on the edit page."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "ID of the note to generate questions from.",
            },
            "question_count": {
                "type": "integer",
                "description": "Number of questions to generate (5-30). Defaults to 10.",
            },
            "question_types": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["SIMPLE", "MULTIPLE_CHOICE"],
                },
                "description": "Types of questions to generate. Defaults to both SIMPLE and MULTIPLE_CHOICE.",
            },
            "difficulty": {
                "type": "string",
                "enum": ["easy", "medium", "hard"],
                "description": "Question difficulty level. Defaults to medium.",
            },
        },
        "required": ["note_id"],
    },
    handler=create_test,
)

EDIT_TEST = ToolSpec(
    name="edit_test",
    description=(
        "Edit an existing test: rename it, change its description, or remove specific questions. "
        "Use get_test_details first to see the test's questions and their IDs. "
        "Requires user confirmation before executing."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "test_id": {
                "type": "string",
                "description": "ID of the test to edit.",
            },
            "title": {
                "type": "string",
                "description": "New title for the test. Omit to keep current.",
            },
            "description": {
                "type": "string",
                "description": "New description for the test. Omit to keep current.",
            },
            "remove_question_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IDs of questions to remove from the test (use qid values from get_test_details).",
            },
        },
        "required": ["test_id"],
    },
    handler=edit_test,
    requires_confirmation=True,
    confirm_context=edit_test_confirm_context,
)
