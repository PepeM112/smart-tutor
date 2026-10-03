"""The assistant tool registry: one `ToolSpec` per tool, plus dispatch.

A tool lives in its domain module (`notes.py`, `tests.py`, ...): the handler and its
`ToolSpec` side by side. This module only lists them in the order the model sees them, and
offers the lookups the assistant loop needs.

To add a tool: write the handler and a `ToolSpec` in the domain module, then add the spec to
`_SPECS` below. `requires_confirmation=True` pauses the stream until the user approves;
add a `confirm_context` builder so the confirm card shows what will happen.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

from app.services.assist_tools import folders, navigation, notes, questions, tests, trash
from app.services.assist_tools.types import ToolResult, ToolSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")

# The order is the order of the tool list that is sent to the model.
_SPECS: tuple[ToolSpec, ...] = (
    notes.LIST_NOTES,
    notes.SEARCH_USER_NOTES,
    tests.LIST_TESTS,
    notes.GET_NOTE_CONTENT,
    tests.GET_TEST_DETAILS,
    questions.SEARCH_QUESTIONS,
    navigation.NAVIGATE_TO,
    folders.LIST_FOLDERS,
    notes.CREATE_NOTE,
    notes.REFINE_NOTE,
    tests.CREATE_TEST,
    tests.EDIT_TEST,
    questions.REFINE_QUESTIONS,
    folders.CREATE_FOLDER,
    folders.MOVE_ITEMS,
    trash.LIST_TRASH,
    trash.RESTORE_FROM_TRASH,
)

TOOLS: dict[str, ToolSpec] = {spec.name: spec for spec in _SPECS}

if len(TOOLS) != len(_SPECS):
    raise RuntimeError("Duplicate tool name in assist_tools registry")


def get_tool_definitions_anthropic() -> list[dict[str, Any]]:
    return [{"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in TOOLS.values()]


def get_tool_definitions_openai() -> list[dict[str, Any]]:
    """Convert the Anthropic-style tool defs to OpenAI function-calling format."""
    return [{"name": t.name, "description": t.description, "parameters": t.input_schema} for t in TOOLS.values()]


def requires_confirmation(name: str) -> bool:
    """True when the tool must wait for the user to approve it. Unknown names never run, so False."""
    spec = TOOLS.get(name)
    return spec is not None and spec.requires_confirmation


def build_confirm_context(
    db: Session, tool_name: str, arguments: dict[str, Any], current_user: User
) -> dict[str, Any] | None:
    """Readable data for the confirm card of a paused tool, or None when the tool has none."""
    spec = TOOLS.get(tool_name)
    if spec is None or spec.confirm_context is None:
        return None
    return spec.confirm_context(db, current_user=current_user, arguments=arguments)


def execute_tool(
    db: Session,
    *,
    current_user: User,
    tool_name: str,
    arguments: dict[str, object],
) -> ToolResult:
    spec = TOOLS.get(tool_name)
    if spec is None:
        logger.warning("Unknown tool requested: %s", tool_name)
        return ToolResult(output=f"Unknown tool: {tool_name}")
    try:
        logger.info("Executing tool: %s (args=%s)", tool_name, arguments)
        result = spec.handler(db, current_user=current_user, arguments=arguments)
        logger.info("Tool %s completed: %s", tool_name, result.output[:200])
        return result
    except HTTPException as exc:
        logger.warning("Tool %s raised HTTP %d: %s", tool_name, exc.status_code, exc.detail)
        return ToolResult(output=f"Error: {exc.detail}")
    except Exception:
        logger.exception("Tool %s failed", tool_name)
        return ToolResult(output=f"Tool execution failed: {tool_name}")
