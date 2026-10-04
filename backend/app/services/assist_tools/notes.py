"""Note tools: list, search, read, create and refine notes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.enums import NoteLength
from app.crud import note as note_crud
from app.schemas.note import NoteGenerate
from app.services import folder_service, note_service
from app.services.assist_tools._helpers import LIST_LIMIT, location_label, note_label
from app.services.assist_tools.types import NoteCreatedMetadata, NoteRefineMetadata, ToolResult, ToolSpec
from app.services.service_helpers import get_owned_or_404

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.user import User

logger = logging.getLogger("smarttutor.assist.tools")

_SIMILARITY_THRESHOLD = 0.15

_LENGTH_MAP: dict[str, NoteLength] = {
    "short": NoteLength.SHORT,
    "medium": NoteLength.MEDIUM,
    "long": NoteLength.LONG,
}


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------


def list_notes(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    title = str(arguments.get("title", "")) or None
    notes, total = note_crud.list_by_user(db, user_id=current_user.id, title=title, per_page=LIST_LIMIT)
    if not notes:
        return ToolResult(output="No notes found.")
    lines = [f"Found {total} note(s):"]
    # One query for all folders, then paths are built in memory.
    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=False)
    for n in notes:
        location = location_label(folders, n.folder_id)
        lines.append(f"- **{note_label(n.title)}** (ID: `{n.id}`, location: {location})")
    return ToolResult(output="\n".join(lines))


def search_user_notes(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    # Imported here: the embedding service pulls in the OpenAI/tiktoken stack, which the
    # other tools do not need.
    from app.services import embedding_service

    query = str(arguments.get("query", ""))
    if not query.strip():
        return ToolResult(output="Error: query is required.")

    raw_limit = arguments.get("limit", 5)
    try:
        limit = max(1, min(10, int(raw_limit) if isinstance(raw_limit, (int, str)) else 5))
    except (TypeError, ValueError):
        limit = 5

    try:
        results = embedding_service.search_notes(db, user_id=current_user.id, query=query, limit=limit)
    except ValueError as exc:
        logger.warning("search_user_notes: embedding service unavailable: %s", exc)
        return ToolResult(output="Error: Semantic search is not available. The embedding service is not configured.")
    except Exception:
        logger.exception("search_user_notes: search failed")
        return ToolResult(output="Error: Search failed unexpectedly.")

    relevant = [r for r in results if r.similarity >= _SIMILARITY_THRESHOLD]
    if not relevant:
        return ToolResult(output="No matching notes found.")

    # Resolve folder paths for result note IDs in one pass.
    note_ids = list({r.note_id for r in relevant})
    # `search_by_similarity` already skips trashed notes; this lookup is only for the folder id.
    notes_map = {n.id: n for n in note_crud.list_live_by_ids(db, user_id=current_user.id, ids=note_ids)}
    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=False)

    lines = [f"Found {len(relevant)} relevant chunk(s):"]
    for r in relevant:
        note = notes_map.get(r.note_id)
        folder_id = note.folder_id if note else None
        location = location_label(folders, folder_id)
        sim = f"{r.similarity:.3f}"
        lines.append(f"\n**{note_label(r.note_title)}** (ID: `{r.note_id}`, location: {location}, sim: {sim})")
        lines.append(r.chunk_content)
    return ToolResult(output="\n".join(lines))


def get_note_content(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    note = get_owned_or_404(db, fetch=note_crud.get_by_id, id=note_id, current_user=current_user, entity_name="Note")
    # get_by_id also returns trashed notes (the note page shows them). The Assistant must not read them.
    if note.deleted_at is not None:
        return ToolResult(output=f"Note `{note_id}` is in Trash. Ask the user to restore it first.")
    folders = folder_service.load_folder_map(db, user_id=current_user.id, include_trashed=False)
    location = location_label(folders, note.folder_id)
    content = note.content or "(empty)"
    return ToolResult(output=f"**{note_label(note.title)}** (location: {location})\n\n{content}")


# ---------------------------------------------------------------------------
# Write tools
# ---------------------------------------------------------------------------


def create_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    topic = str(arguments.get("topic", ""))
    guidance = str(arguments.get("guidance", "")) or None
    length_str = str(arguments.get("length", "medium"))
    length = _LENGTH_MAP.get(length_str, NoteLength.MEDIUM)
    folder_id = str(arguments["folder_id"]) if arguments.get("folder_id") else None

    logger.info("create_note: user=%s topic=%r length=%s folder=%s", current_user.id, topic, length_str, folder_id)
    note = note_service.generate_note(
        db,
        current_user=current_user,
        data=NoteGenerate(topic=topic, guidance=guidance, length=length, folder_id=folder_id),
    )
    # Not indexed here: the tool runs inside the chat stream, and the embedding call would
    # hold it. `search_notes` indexes stale notes (is_indexed = False) before each search.
    logger.info("create_note: created note=%s", note.id)
    return ToolResult(
        output=(
            f"Note created successfully!\n- **Title:** {note_label(note.title)}\n"
            f"- **Preview:** {(note.content or '')[:300]}…"
        ),
        metadata=NoteCreatedMetadata(note_id=note.id),
    )


def refine_note(db: Session, *, current_user: User, arguments: dict[str, object]) -> ToolResult:
    note_id = str(arguments.get("note_id", ""))
    instructions = str(arguments.get("instructions", ""))

    logger.info("refine_note: user=%s note=%s", current_user.id, note_id)
    old_content, refined_text = note_service.preview_refine_note(
        db,
        note_id=note_id,
        current_user=current_user,
        instructions=instructions,
    )
    return ToolResult(
        output="Note refinement ready for review.",
        metadata=NoteRefineMetadata(
            note_id=note_id,
            old_content=old_content,
            new_content=refined_text,
        ),
    )


# ---------------------------------------------------------------------------
# Specs
# ---------------------------------------------------------------------------

LIST_NOTES = ToolSpec(
    name="list_notes",
    description=(
        "List the user's study notes. Returns titles, IDs and folder path. "
        "Only filters by exact title text — does NOT search tags, content, or topics. "
        "Use without a title filter to browse all notes. "
        "For topic-based queries, prefer search_user_notes instead."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Optional search term to filter notes by title.",
            },
        },
        "required": [],
    },
    handler=list_notes,
)

SEARCH_USER_NOTES = ToolSpec(
    name="search_user_notes",
    description=(
        "Semantically search the user's study notes using AI embeddings. "
        "Returns the most relevant text chunks from notes that match the query meaning — "
        "finds notes by topic, tags, and content, not just title keywords. "
        "PREFERRED tool when the user asks about a subject or topic (e.g. 'history', "
        "'biology', 'Spanish grammar'). Use this instead of list_notes for any "
        "topic-based lookup."
    ),
    input_schema={
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
    handler=search_user_notes,
)

GET_NOTE_CONTENT = ToolSpec(
    name="get_note_content",
    description="Get the full content of a specific note by its ID.",
    input_schema={
        "type": "object",
        "properties": {
            "note_id": {"type": "string", "description": "The note's ID."},
        },
        "required": ["note_id"],
    },
    handler=get_note_content,
)

CREATE_NOTE = ToolSpec(
    name="create_note",
    description=(
        "Generate a new AI-powered study note on a given topic. "
        "Call directly when the user explicitly asks to create a note. "
        "Ask conversationally first only if intent is ambiguous. "
        "Use list_folders first to obtain a folder_id when the user wants the note in a folder."
    ),
    input_schema={
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
            "folder_id": {
                "type": "string",
                "description": "Optional folder ID to place the note in. Use list_folders to find IDs.",
            },
        },
        "required": ["topic"],
    },
    handler=create_note,
)

REFINE_NOTE = ToolSpec(
    name="refine_note",
    description=(
        "Refine an existing note with AI based on instructions. "
        "Executes directly — the user reviews the proposed changes in a diff view before accepting."
    ),
    input_schema={
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
    handler=refine_note,
)
