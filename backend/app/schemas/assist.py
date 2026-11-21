from __future__ import annotations

from typing import Literal

from app.schemas.base import BaseSchema


class PageContext(BaseSchema):
    route: str
    resource_type: str | None = None
    resource_id: str | None = None
    context_data: str | None = None


class ToolCallData(BaseSchema):
    id: str
    name: str
    arguments: dict[str, object]


class ToolResultData(BaseSchema):
    tool_call_id: str
    output: object


class ThinkingBlockData(BaseSchema):
    """A `thinking` or `redacted_thinking` block of Anthropic. The values are opaque: send them back unchanged."""

    type: Literal["thinking", "redacted_thinking"]
    thinking: str | None = None
    signature: str | None = None
    data: str | None = None


class AssistMessage(BaseSchema):
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCallData] | None = None
    tool_results: list[ToolResultData] | None = None
    # The blocks of this round. Haiku 5.5 needs them back with the tool calls of the same message.
    thinking_blocks: list[ThinkingBlockData] | None = None


class ToolConfirmation(BaseSchema):
    tool_call_id: str
    approved: bool


class AssistRequest(BaseSchema):
    messages: list[AssistMessage]
    page_context: PageContext | None = None
    tool_confirmations: list[ToolConfirmation] | None = None
    # The classroom (or classroom course) of the chat. It picks the AI key and books the usage.
    space_id: str | None = None
