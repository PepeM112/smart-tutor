"""Tool definitions and executor for the AI assistant.

Each tool is a function the LLM can call. Read tools auto-execute; write
tools return a ``confirm_required`` marker so the frontend can show
Accept/Reject before the action runs.
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.enums import NoteLength, QuestionType
from app.crud import note as note_crud
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.schemas.note import NoteGenerate, NoteRefine
from app.schemas.test import TestCreate
from app.schemas.test_generation import TestGenerationRequest

if TYPE_CHECKING:
    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")


@dataclass(frozen=True, slots=True)
class ToolResult:
    output: str
    metadata: dict[str, Any] | None = None


ToolHandler = Callable[[Session], ToolResult]


# ---------------------------------------------------------------------------
# Tool definitions (sent to the LLM as tool schemas)
# ---------------------------------------------------------------------------

# Anthropic format — ``name``, ``description``, ``input_schema`` (JSON Schema).
# The service layer converts these to OpenAI's ``function`` format as needed.

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_notes",
        "description": "List the user's study notes. Returns titles and IDs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Optional search term to filter notes by title.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_tests",
        "description": "List the user's tests. Returns titles, IDs, and question counts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Optional search term to filter tests by title.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_note_content",
        "description": "Get the full content of a specific note by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "The note's ID."},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "get_test_details",
        "description": "Get a test's details including its questions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "test_id": {"type": "string", "description": "The test's ID."},
            },
            "required": ["test_id"],
        },
    },
    {
        "name": "search_questions",
        "description": "Search the user's question bank.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Search term to filter questions by prompt text.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "navigate_to",
        "description": (
            "Navigate the user to a specific page in the app. Use for directing them to notes, tests, settings, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The route path, e.g. '/notes', '/tests/abc123/edit', '/settings'.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "create_note",
        "description": (
            "Generate a new AI-powered study note on a given topic. Requires user confirmation before executing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "The subject to generate notes about.",
                },
                "guidance": {
                    "type": "string",
                    "description": "Optional additional instructions for the note generation.",
                },
                "length": {
                    "type": "string",
                    "enum": ["short", "medium", "long"],
                    "description": "Note length. Defaults to medium.",
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "refine_note",
        "description": (
            "Refine an existing note with AI based on instructions. Requires user confirmation before executing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "ID of the note to refine."},
                "instructions": {
                    "type": "string",
                    "description": "Instructions for how to improve the note.",
                },
            },
            "required": ["note_id", "instructions"],
        },
    },
    {
        "name": "create_test",
        "description": (
            "Generate a test with AI-created questions from an existing note. "
            "Use list_notes first to find the note ID. Requires user confirmation before executing."
        ),
        "input_schema": {
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
    },
    {
        "name": "edit_test",
        "description": (
            "Edit an existing test: rename it, change its description, or remove specific questions. "
            "Use get_test_details first to see the test's questions and their IDs. "
            "Requires user confirmation before executing."
        ),
        "input_schema": {
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
    },
]

WRITE_TOOLS = {"create_note", "refine_note", "create_test", "edit_test"}


def get_tool_definitions_anthropic() -> list[dict[str, Any]]:
    return TOOL_DEFINITIONS


def get_tool_definitions_openai() -> list[dict[str, Any]]:
    """Convert Anthropic-style tool defs to OpenAI function-calling format."""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        }
        for t in TOOL_DEFINITIONS
    ]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

_LENGTH_MAP: dict[str, NoteLength] = {
    "short": NoteLength.SHORT,
    "medium": NoteLength.MEDIUM,
    "long": NoteLength.LONG,
}


def execute_tool(
    db: Session,
    *,
    current_user: User,
    tool_name: str,
    arguments: dict[str, object],
) -> ToolResult:
    """Execute a tool and return its result as a string.

    Write tools are only executed after the user has confirmed — the service
    layer handles gating; by the time this function is called the action is
    approved.
    """
    handler = _HANDLERS.get(tool_name)
    if handler is None:
        logger.warning("Unknown tool requested: %s", tool_name)
        return ToolResult(output=f"Unknown tool: {tool_name}")
    try:
        logger.info("Executing tool: %s (args=%s)", tool_name, arguments)
        result = handler(db, current_user=current_user, arguments=arguments)
        logger.info("Tool %s completed: %s", tool_name, result.output[:200])
        return result
    except HTTPException as exc:
        logger.warning("Tool %s raised HTTP %d: %s", tool_name, exc.status_code, exc.detail)
        return ToolResult(output=f"Error: {exc.detail}")
    except Exception:
        logger.exception("Tool %s failed", tool_name)
        return ToolResult(output=f"Tool execution failed: {tool_name}")


def _list_notes(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    notes, total = note_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=20)
    if not notes:
        return ToolResult(output="No notes found.")
    lines = [f"Found {total} note(s):"]
    for n in notes:
        lines.append(f"- **{n.title}** (ID: `{n.id}`)")
    return ToolResult(output="\n".join(lines))


def _list_tests(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    tests, total = test_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=20)
    if not tests:
        return ToolResult(output="No tests found.")
    lines = [f"Found {total} test(s):"]
    for t in tests:
        q_count = len([q for q in (t.questions or [])]) + sum(len(g.questions or []) for g in (t.question_groups or []))
        lines.append(f"- **{t.title}** ({q_count} questions, ID: `{t.id}`)")
    return ToolResult(output="\n".join(lines))


def _get_note_content(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    note = note_crud.get_by_id(db, id=note_id)
    if note is None or note.user_id != current_user.id:
        return ToolResult(output="Note not found.")
    content = note.content or "(empty)"
    return ToolResult(output=f"**{note.title}**\n\n{content}")


def _get_test_details(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    test_id = str(arguments.get("test_id", ""))
    test = test_crud.get_by_id(db, id=test_id)
    if test is None or test.user_id != current_user.id:
        return ToolResult(output="Test not found.")
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


def _search_questions(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    search = str(arguments.get("search", "")) or None
    questions, total = question_crud.list_by_user(db, user_id=current_user.id, search=search, per_page=15)
    if not questions:
        return ToolResult(output="No questions found.")
    lines = [f"Found {total} question(s):"]
    for q in questions:
        test_label = f"in test `{q.test_id}`" if q.test_id else "in Question Bank"
        lines.append(f"- [{QuestionType(q.question_type).name}] {q.prompt} ({test_label}, ID: `{q.id}`)")
    return ToolResult(output="\n".join(lines))


_ALLOWED_ROUTE_PREFIXES = (
    "/dashboard",
    "/notes",
    "/tests",
    "/questions",
    "/review",
    "/history",
    "/settings",
)


def _navigate_to(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    path = str(arguments.get("path", "/dashboard"))
    if not path.startswith("/") or not path.startswith(_ALLOWED_ROUTE_PREFIXES):
        path = "/dashboard"
    return ToolResult(output=f"__NAVIGATE__:{path}")


def _create_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    from app.services import note_service

    topic = str(arguments.get("topic", ""))
    guidance = str(arguments.get("guidance", "")) or None
    length_str = str(arguments.get("length", "medium"))
    length = _LENGTH_MAP.get(length_str, NoteLength.MEDIUM)

    note = note_service.generate_note(
        db,
        current_user=current_user,
        data=NoteGenerate(topic=topic, guidance=guidance, length=length),
    )
    return ToolResult(
        output=(
            f"Note created successfully!\n"
            f"- **Title:** {note.title}\n"
            f"- **ID:** `{note.id}`\n"
            f"- **Preview:** {(note.content or '')[:300]}…"
        ),
    )


def _refine_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    from app.services import note_service

    note_id = str(arguments.get("note_id", ""))
    instructions = str(arguments.get("instructions", ""))

    old_note = note_service.get_note(db, note_id=note_id, current_user=current_user)
    old_content = old_note.content or ""

    note = note_service.refine_note(
        db,
        note_id=note_id,
        current_user=current_user,
        data=NoteRefine(instructions=instructions),
    )
    return ToolResult(
        output=(
            f"Note refined successfully!\n"
            f"- **Title:** {note.title}\n"
            f"- **ID:** `{note.id}`\n"
            f"- **Preview:** {(note.content or '')[:300]}…"
        ),
        metadata={
            "note_id": note.id,
            "old_content": old_content,
            "new_content": note.content or "",
        },
    )


def _create_test(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    from app.services import test_generation_service, test_service

    note_id = str(arguments.get("note_id", ""))
    question_count = int(arguments.get("question_count", 10))
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

    from app.schemas.question import QuestionCreate

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
            f"- **ID:** `{test.id}`\n"
            f"- **Questions:** {len(questions)}"
        ),
    )


def _edit_test(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    from app.services import question_service, test_service

    test_id = str(arguments.get("test_id", ""))
    test = test_service.get_test(db, test_id=test_id, current_user=current_user)

    changes: list[str] = []

    new_title = arguments.get("title")
    new_description = arguments.get("description")
    if new_title or new_description:
        from app.schemas.test import TestUpdate

        update_data = TestUpdate(
            title=str(new_title) if new_title else None,
            description=str(new_description) if new_description else None,
        )
        test = test_service.update_test(db, test_id=test_id, current_user=current_user, data=update_data)
        if new_title:
            changes.append(f"Title changed to **{new_title}**")
        if new_description:
            changes.append("Description updated")

    removed_question_ids: list[str] = []
    remove_ids = arguments.get("remove_question_ids")
    if isinstance(remove_ids, list) and remove_ids:
        str_ids = [str(qid) for qid in remove_ids]
        removed_question_ids = cast(
            list[str],
            question_service.bulk_delete_questions(
                db, question_ids=str_ids, current_user=current_user, force_soft_delete=True, return_ids=True
            ),
        )
        changes.append(f"{len(removed_question_ids)} question(s) removed")

    if not changes:
        return ToolResult(output="No changes specified.")

    metadata: dict[str, Any] = {"test_id": test_id}
    if removed_question_ids:
        metadata["removed_question_ids"] = removed_question_ids

    return ToolResult(
        output=(
            f"Test edited successfully!\n"
            f"- **Title:** {test.title}\n"
            f"- **ID:** `{test.id}`\n"
            f"- **Changes:** {', '.join(changes)}"
        ),
        metadata=metadata,
    )


_HANDLERS: dict[str, ToolHandler] = {
    "list_notes": _list_notes,
    "list_tests": _list_tests,
    "get_note_content": _get_note_content,
    "get_test_details": _get_test_details,
    "search_questions": _search_questions,
    "navigate_to": _navigate_to,
    "create_note": _create_note,
    "refine_note": _refine_note,
    "create_test": _create_test,
    "edit_test": _edit_test,
}
