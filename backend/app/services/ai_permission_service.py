"""Approval policy of the assistant tools: the default of each tool kind plus the per-user overrides.

The assistant loop asks `needs_confirmation` before it runs a tool. The decision is made on the
server from data of the user row, so a client can not skip a confirm card.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.crud import user as user_crud
from app.models.user import User
from app.schemas.user import AiToolPermissionRead, AiToolPermissionsUpdate
from app.services.assist_tools import TOOLS, ToolSpec


def _default_auto_approve(spec: ToolSpec) -> bool:
    return spec.kind == "read"


def _auto_approve(user: User, spec: ToolSpec) -> bool:
    override = (user.ai_tool_permissions or {}).get(spec.name)
    return override if isinstance(override, bool) else _default_auto_approve(spec)


def needs_confirmation(user: User, tool_name: str) -> bool:
    """True when the tool must wait for the user to approve it. Unknown names never run, so False."""
    spec = TOOLS.get(tool_name)
    return spec is not None and not _auto_approve(user, spec)


def list_permissions(user: User) -> list[AiToolPermissionRead]:
    return [
        AiToolPermissionRead(
            name=spec.name,
            kind=spec.kind,
            default_auto_approve=_default_auto_approve(spec),
            auto_approve=_auto_approve(user, spec),
        )
        for spec in TOOLS.values()
    ]


def update_permissions(db: Session, *, current_user: User, data: AiToolPermissionsUpdate) -> list[AiToolPermissionRead]:
    incoming = data.permissions or {}
    unknown = sorted(incoming.keys() - TOOLS.keys())
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Unknown tool(s): {', '.join(unknown)}"
        )
    if incoming:
        merged = {**(current_user.ai_tool_permissions or {}), **incoming}
        # A new dict (not an in-place change) so SQLAlchemy sees the JSONB value as modified.
        # Names of tools that no longer exist are dropped here.
        known = {name: value for name, value in merged.items() if name in TOOLS}
        user_crud.update(db, user=current_user, data={"ai_tool_permissions": known})
        db.commit()
        db.refresh(current_user)
    return list_permissions(current_user)
