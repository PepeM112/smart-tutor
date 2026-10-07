"""Navigation tool: send the user's browser to a page of the app."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlsplit

from app.services.assist_tools.types import NavigateMetadata, ToolResult, ToolSpec

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

_ALLOWED_ROUTE_PREFIXES = (
    "/dashboard",
    "/files",
    "/notes/",  # note pages only; the "/notes" list page does not exist
    "/tests",
    "/questions",
    "/review",
    "/history",
    "/settings",
    "/stats",
    "/trash",
)

_SETTINGS_TABS = {"profile", "ai", "appearance", "srs"}


def _clean_settings_path(path: str) -> str:
    """Keep `?tab=` on a settings path only when it is a known tab. Other queries are dropped."""
    parts = urlsplit(path)
    tab = parse_qs(parts.query).get("tab", [""])[0]
    return f"{parts.path}?tab={tab}" if tab in _SETTINGS_TABS else parts.path


def navigate_to(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    path = str(arguments.get("path", "/dashboard"))
    if not path.startswith(_ALLOWED_ROUTE_PREFIXES):
        path = "/dashboard"
    elif path.startswith("/settings"):
        path = _clean_settings_path(path)
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
                    "The route path. Examples: '/notes/<id>' (a note), '/tests/abc123/edit', "
                    "'/settings?tab=ai' (tabs: profile, ai, appearance, srs), '/files' (files root), "
                    "'/files/<slug>-<ulid>' (a specific folder)."
                ),
            },
        },
        "required": ["path"],
    },
    handler=navigate_to,
    kind="read",
)
