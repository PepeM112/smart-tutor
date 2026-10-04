"""Shared types of the assistant tools: results, metadata and the `ToolSpec` of one tool.

`ToolSpec` lives here and not in `registry.py` on purpose. The domain modules (`notes.py`,
`tests.py`, ...) build their `ToolSpec`s, and `registry.py` imports the domain modules to
collect them. If `ToolSpec` were in the registry, the two would import each other.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from app.schemas.base import BaseSchema
from app.schemas.test_generation import GeneratedQuestionPreview
from app.schemas.user import ToolKind

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User


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


class ConfirmContextBuilder(Protocol):
    """Turns the arguments of a paused write tool into data for the confirm card.

    The model sends IDs. The builder resolves them to names the user can read. It must only
    use items of `current_user`, so the card never shows data of another user.
    """

    def __call__(self, db: Session, *, current_user: User, arguments: dict[str, Any]) -> dict[str, Any] | None: ...


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """Everything about one tool in one place: schema, handler and kind.

    `input_schema` is JSON Schema in the Anthropic shape. The registry converts it to the
    OpenAI shape when needed. `kind` gives the default approval policy (read runs at once,
    write waits for the user); the user can override it per tool (see `ai_permission_service`).
    The optional `confirm_context` builds the readable summary for the confirm card.
    """

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler
    kind: ToolKind
    confirm_context: ConfirmContextBuilder | None = None
