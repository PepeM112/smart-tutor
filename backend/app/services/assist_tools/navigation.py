"""Navigation tool: send the user's browser to a page of the app."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.assist_tools.types import NavigateMetadata, ToolResult, ToolSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

_ALLOWED_ROUTE_PREFIXES = (
    "/dashboard",
    "/files",
    "/notes",
    "/tests",
    "/questions",
    "/review",
    "/history",
    "/settings",
    "/stats",
    "/trash",
)


def navigate_to(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    path = str(arguments.get("path", "/dashboard"))
    if not path.startswith(_ALLOWED_ROUTE_PREFIXES):
        path = "/dashboard"
    return ToolResult(
        output=f"Navigating to {path}",
        metadata=NavigateMetadata(route=path),
    )


NAVIGATE_TO = ToolSpec(
    name="navigate_to",
    description=(
        "Navigate the user to a specific page in the app. Use for directing them to notes, tests, files, settings, etc."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": (
                    "The route path. Examples: '/notes', '/tests/abc123/edit', '/settings', "
                    "'/files' (files root), '/files/<slug>-<ulid>' (a specific folder)."
                ),
            },
        },
        "required": ["path"],
    },
    handler=navigate_to,
    kind="read",
)
