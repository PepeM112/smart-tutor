"""Tool definitions and dispatch for the AI assistant.

Tool schemas (sent to the LLM) live here.  Execution logic lives in
``assist_tools_service``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.schemas.base import BaseSchema
from app.schemas.test_generation import GeneratedQuestionPreview

if TYPE_CHECKING:
    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")


class NavigateMetadata(BaseSchema):
    route: str


class NoteCreatedMetadata(BaseSchema):
    note_id: str


class NoteRefineMetadata(BaseSchema):
    note_id: str
    old_content: str
    new_content: str


class TestCreatedMetadata(BaseSchema):
    test_id: str


class TestEditMetadata(BaseSchema):
    test_id: str
    removed_question_ids: list[str] | None = None


class QuestionRefineMetadata(BaseSchema):
    test_id: str
    questions: list[GeneratedQuestionPreview]
    selected_indices: list[int]


ToolResultMetadata = (
    NavigateMetadata
    | NoteCreatedMetadata
    | NoteRefineMetadata
    | TestCreatedMetadata
    | TestEditMetadata
    | QuestionRefineMetadata
)


@dataclass(frozen=True, slots=True)
class ToolResult:
    output: str
    metadata: ToolResultMetadata | None = None


class ToolHandler(Protocol):
    def __call__(self, db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult: ...


# ---------------------------------------------------------------------------
# Tool definitions (sent to the LLM as tool schemas)
# ---------------------------------------------------------------------------

# Anthropic format — ``name``, ``description``, ``input_schema`` (JSON Schema).
# The service layer converts these to OpenAI's ``function`` format as needed.

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_notes",
        "description": "List the user's study notes. Returns titles and IDs. Use for browsing/listing notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Optional search term to filter notes by title.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "search_user_notes",
        "description": (
            "Semantically search the user's study notes using AI embeddings. "
            "Returns the most relevant text chunks from notes that match the query meaning, "
            "not just keyword matches. Use this when the user asks about a topic and you want "
            "to find relevant information from their notes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language query describing what to search for.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (1-10). Defaults to 5.",
                },
            },
            "required": ["query"],
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
            "Generate a new AI-powered study note on a given topic. "
            "Call directly when the user explicitly asks to create a note. "
            "Ask conversationally first only if intent is ambiguous."
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
            "Refine an existing note with AI based on instructions. "
            "Executes directly — the user reviews the proposed changes in a diff view before accepting."
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
            "Use list_notes first to find the note ID. "
            "Executes directly — the user will see a link to review the generated test on the edit page."
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
    {
        "name": "refine_questions",
        "description": (
            "Edit the content of specific questions in a test using AI. "
            "Use get_test_details first to see the test's questions. "
            "Executes directly — the user reviews the proposed changes in a diff view before accepting."
        ),
        "input_schema": {
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
    },
]

WRITE_TOOLS = {"edit_test"}


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
# Tool execution — delegates to assist_tools_service
# ---------------------------------------------------------------------------


def execute_tool(
    db: Session,
    *,
    current_user: User,
    tool_name: str,
    arguments: dict[str, object],
) -> ToolResult:
    _ensure_handlers()
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


def _build_handlers() -> dict[str, ToolHandler]:
    from app.services import assist_tools_service as svc

    return {
        "list_notes": svc.list_notes,
        "search_user_notes": svc.search_user_notes,
        "list_tests": svc.list_tests,
        "get_note_content": svc.get_note_content,
        "get_test_details": svc.get_test_details,
        "search_questions": svc.search_questions,
        "navigate_to": svc.navigate_to,
        "create_note": svc.create_note,
        "refine_note": svc.refine_note,
        "create_test": svc.create_test,
        "edit_test": svc.edit_test,
        "refine_questions": svc.refine_questions,
    }


_HANDLERS: dict[str, ToolHandler] = {}


def _ensure_handlers() -> None:
    global _HANDLERS
    if not _HANDLERS:
        _HANDLERS = _build_handlers()
