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


class AssistMessage(BaseSchema):
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCallData] | None = None
    tool_results: list[ToolResultData] | None = None


class ToolConfirmation(BaseSchema):
    tool_call_id: str
    approved: bool


class AssistRequest(BaseSchema):
    messages: list[AssistMessage]
    page_context: PageContext | None = None
    tool_confirmations: list[ToolConfirmation] | None = None
