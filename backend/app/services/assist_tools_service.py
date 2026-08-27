"""Execution logic for AI assistant tools.

Read tools route through service-layer ownership helpers (``get_owned_or_404``)
instead of duplicating inline checks.  Write tools delegate to existing
``*_service`` modules — they are only called after the user has confirmed.
"""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any

from app.core.enums import NoteLength, QuestionType
from app.crud import note as note_crud
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.schemas.note import NoteGenerate
from app.schemas.question import QuestionCreate
from app.schemas.test import TestCreate, TestUpdate
from app.schemas.test_generation import GeneratedQuestionPreview, QuestionEditRequest, TestGenerationRequest
from app.services import note_service, question_service, test_generation_service, test_service
from app.services.assist_tools import ToolResult
from app.services.service_helpers import get_owned_or_404

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.question import Question
    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")

_TOOL_LIST_LIMIT = 20
_TOOL_SEARCH_LIMIT = 15

_LENGTH_MAP: dict[str, NoteLength] = {
    "short": NoteLength.SHORT,
    "medium": NoteLength.MEDIUM,
    "long": NoteLength.LONG,
}

_ALLOWED_ROUTE_PREFIXES = (
    "/dashboard",
    "/notes",
    "/tests",
    "/questions",
    "/review",
    "/history",
    "/settings",
    "/stats",
)


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def list_notes(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    notes, total = note_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=_TOOL_LIST_LIMIT)
    if not notes:
        return ToolResult(output="No notes found.")
    lines = [f"Found {total} note(s):"]
    for n in notes:
        lines.append(f"- **{n.title}** (ID: `{n.id}`)")
    return ToolResult(output="\n".join(lines))


def list_tests(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    tests, total = test_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=_TOOL_LIST_LIMIT)
    if not tests:
        return ToolResult(output="No tests found.")
    lines = [f"Found {total} test(s):"]
    for t in tests:
        q_count = len(t.questions or []) + sum(len(g.questions or []) for g in (t.question_groups or []))
        lines.append(f"- **{t.title}** ({q_count} questions, ID: `{t.id}`)")
    return ToolResult(output="\n".join(lines))


def get_note_content(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    note = get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")
    content = note.content or "(empty)"
    return ToolResult(output=f"**{note.title}**\n\n{content}")


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


def search_questions(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    questions, total = question_crud.list_by_user(
        db, user_id=current_user.id, search=search, per_page=_TOOL_SEARCH_LIMIT
    )
    if not questions:
        return ToolResult(output="No questions found.")
    lines = [f"Found {total} question(s):"]
    for q in questions:
        test_label = f"in test `{q.test_id}`" if q.test_id else "in Question Bank"
        lines.append(f"- [{QuestionType(q.question_type).name}] {q.prompt} ({test_label}, ID: `{q.id}`)")
    return ToolResult(output="\n".join(lines))


def navigate_to(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    path = str(arguments.get("path", "/dashboard"))
    if not path.startswith(_ALLOWED_ROUTE_PREFIXES):
        path = "/dashboard"
    return ToolResult(
        output=f"Navigating to {path}",
        metadata={"route": path},
    )


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def create_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    topic = str(arguments.get("topic", ""))
    guidance = str(arguments.get("guidance", "")) or None
    length_str = str(arguments.get("length", "medium"))
    length = _LENGTH_MAP.get(length_str, NoteLength.MEDIUM)

    logger.info("create_note: user=%s topic=%r length=%s", current_user.id, topic, length_str)
    note = note_service.generate_note(
        db,
        current_user=current_user,
        data=NoteGenerate(topic=topic, guidance=guidance, length=length),
    )
    logger.info("create_note: created note=%s", note.id)
    return ToolResult(
        output=(
            f"Note created successfully!\n"
            f"- **Title:** {note.title}\n"
            f"- **Preview:** {(note.content or '')[:300]}…"
        ),
        metadata={"note_id": note.id},
    )


def refine_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    instructions = str(arguments.get("instructions", ""))

    logger.info("refine_note: user=%s note=%s", current_user.id, note_id)
    old_note = note_service.get_note(db, note_id=note_id, current_user=current_user)
    old_content = old_note.content or ""

    refined_text = note_service.preview_refine_note(
        db,
        note_id=note_id,
        current_user=current_user,
        instructions=instructions,
    )
    return ToolResult(
        output="Note refinement ready for review.",
        metadata={
            "note_id": note_id,
            "old_content": old_content,
            "new_content": refined_text,
        },
    )


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
        output=(
            f"Test created successfully!\n"
            f"- **Title:** {test.title}\n"
            f"- **Questions:** {len(questions)}"
        ),
        metadata={"test_id": test.id},
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
    metadata: dict[str, Any] = {"test_id": test_id}
    if removed_question_ids:
        metadata["removed_question_ids"] = removed_question_ids

    return ToolResult(
        output=(
            f"Test edited successfully!\n"
            f"- **Title:** {test.title}\n"
            f"- **Changes:** {', '.join(changes)}"
        ),
        metadata=metadata,
    )


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
        metadata={
            "test_id": test_id,
            "questions": [q.model_dump(by_alias=True) for q in result.questions],
            "selected_indices": selected_indices,
        },
    )
