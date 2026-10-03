"""AI assistant tools: one module per domain, one registry.

Import from here: `from app.services.assist_tools import execute_tool, ...`.
"""

from app.services.assist_tools.registry import (
    TOOLS,
    build_confirm_context,
    execute_tool,
    get_tool_definitions_anthropic,
    get_tool_definitions_openai,
    requires_confirmation,
)
from app.services.assist_tools.types import ToolHandler, ToolResult, ToolSpec

__all__ = [
    "TOOLS",
    "ToolHandler",
    "ToolResult",
    "ToolSpec",
    "build_confirm_context",
    "execute_tool",
    "get_tool_definitions_anthropic",
    "get_tool_definitions_openai",
    "requires_confirmation",
]
