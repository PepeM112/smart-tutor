"""Tool definitions and executor for the AI assistant.

Each tool is a function the LLM can call. Read tools auto-execute; write
tools return a ``confirm_required`` marker so the frontend can show
Accept/Reject before the action runs.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from app.core.enums import NoteLength, QuestionType
from app.crud import note as note_crud
from app.crud import question as question_crud
from app.crud import test as test_crud
from app.schemas.note import NoteGenerate, NoteRefine

if TYPE_CHECKING:
    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s [%(name)s] %(message)s"))
    logger.addHandler(_h)


@dataclass(frozen=True, slots=True)
class ToolResult:
    output: str
    requires_confirmation: bool = False


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
]

WRITE_TOOLS = {"create_note", "refine_note"}


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
    lines = [f"**{test.title}**"]
    if test.description:
        lines.append(test.description)
    lines.append("")
    idx = 1
    for q in test.questions or []:
        lines.append(f"{idx}. [{QuestionType(q.question_type).name}] {q.prompt}")
        idx += 1
    for g in test.question_groups or []:
        lines.append(f"\n**Group: {g.title}**")
        for q in g.questions or []:
            lines.append(f"{idx}. [{QuestionType(q.question_type).name}] {q.prompt}")
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


def _navigate_to(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    path = str(arguments.get("path", "/dashboard"))
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
    )


_HANDLERS: dict[str, Any] = {
    "list_notes": _list_notes,
    "list_tests": _list_tests,
    "get_note_content": _get_note_content,
    "get_test_details": _get_test_details,
    "search_questions": _search_questions,
    "navigate_to": _navigate_to,
    "create_note": _create_note,
    "refine_note": _refine_note,
}
