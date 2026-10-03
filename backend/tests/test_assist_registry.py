"""Tests for the assistant tool registry and the folder/trash tools (mocked services).

Run:  pytest tests/test_assist_registry.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.schemas.folder import FolderCreate
from app.schemas.trash import TrashItemRead
from app.services.assist_prompts import ASSIST_SYSTEM_PROMPT
from app.services.assist_tools import (
    TOOLS,
    build_confirm_context,
    execute_tool,
    get_tool_definitions_anthropic,
    get_tool_definitions_openai,
    registry,
    requires_confirmation,
)

CONFIRM_TOOLS = {"edit_test", "create_folder", "move_items", "restore_from_trash"}
NEW_TOOLS = ["create_folder", "move_items", "list_trash", "restore_from_trash"]

FOLDERS = "app.services.assist_tools.folders"
TRASH = "app.services.assist_tools.trash"


def _user(id: str = "u1") -> MagicMock:
    u = MagicMock()
    u.id = id
    return u


def _folder(id: str, name: str, parent_id: str | None = None, orphan_path: list[str] | None = None) -> MagicMock:
    f = MagicMock()
    f.id = id
    f.name = name
    f.parent_id = parent_id
    f.orphan_path = orphan_path
    f.user_id = "u1"
    f.deleted_at = None
    return f


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestRegistry:
    def test_names_are_unique(self) -> None:
        assert len(registry._SPECS) == len(TOOLS)

    def test_every_tool_has_a_handler_and_a_matching_key(self) -> None:
        for name, spec in TOOLS.items():
            assert spec.name == name
            assert callable(spec.handler)

    def test_schemas_are_objects_and_required_fields_exist(self) -> None:
        for spec in TOOLS.values():
            schema = spec.input_schema
            assert schema["type"] == "object"
            assert set(schema["required"]) <= set(schema["properties"])
            assert spec.description

    def test_only_the_expected_tools_require_confirmation(self) -> None:
        assert {n for n in TOOLS if requires_confirmation(n)} == CONFIRM_TOOLS

    def test_list_trash_is_a_read_tool(self) -> None:
        assert requires_confirmation("list_trash") is False

    def test_unknown_tool_does_not_require_confirmation(self) -> None:
        assert requires_confirmation("does_not_exist") is False

    def test_every_confirmation_tool_has_a_confirm_card_builder(self) -> None:
        assert all(TOOLS[n].confirm_context is not None for n in CONFIRM_TOOLS)

    def test_new_tools_come_after_the_existing_ones(self) -> None:
        names = [d["name"] for d in get_tool_definitions_anthropic()]
        assert names[-4:] == NEW_TOOLS
        assert len(names) == 17

    def test_provider_formats_have_the_same_tools(self) -> None:
        anthropic = get_tool_definitions_anthropic()
        openai = get_tool_definitions_openai()
        assert [t["name"] for t in anthropic] == [t["name"] for t in openai]
        assert all(set(t) == {"name", "description", "input_schema"} for t in anthropic)
        assert all(set(t) == {"name", "description", "parameters"} for t in openai)

    def test_system_prompt_names_every_new_tool(self) -> None:
        assert all(name in ASSIST_SYSTEM_PROMPT for name in NEW_TOOLS)

    def test_unknown_tool_gives_an_error_result(self) -> None:
        result = execute_tool(MagicMock(), current_user=_user(), tool_name="nope", arguments={})
        assert result.output == "Unknown tool: nope"

    def test_http_error_becomes_a_readable_tool_error(self) -> None:
        with patch(f"{FOLDERS}.folder_service.create_folder", side_effect=HTTPException(404, "Folder not found")):
            result = execute_tool(
                MagicMock(), current_user=_user(), tool_name="create_folder", arguments={"name": "X", "parent_id": "p"}
            )
        assert result.output == "Error: Folder not found"


# ---------------------------------------------------------------------------
# create_folder
# ---------------------------------------------------------------------------


class TestCreateFolder:
    def _run(self, arguments: dict[str, object]) -> str:
        return execute_tool(MagicMock(), current_user=_user(), tool_name="create_folder", arguments=arguments).output

    def test_creates_the_folder_and_returns_its_id(self) -> None:
        created = _folder("new1", "Biology", parent_id="a")
        with patch(f"{FOLDERS}.folder_service") as svc:
            svc.create_folder.return_value = created
            svc.load_folder_map.return_value = {"a": _folder("a", "Science")}
            output = self._run({"name": "  Biology ", "parent_id": "a"})

        data = svc.create_folder.call_args.kwargs["data"]
        assert data == FolderCreate(name="Biology", parent_id="a")
        assert "`new1`" in output
        assert "Files > Science" in output

    def test_missing_name_is_an_error(self) -> None:
        assert self._run({"name": "  "}) == "Error: name is required."

    def test_name_clash_tells_the_model_to_reuse_the_folder(self) -> None:
        clash = HTTPException(409, "A folder named 'Biology' already exists in the root")
        with patch(f"{FOLDERS}.folder_service.create_folder", side_effect=clash):
            output = self._run({"name": "Biology"})
        assert output.startswith("Error: A folder named 'Biology' already exists")
        assert "list_folders" in output

    def test_parent_of_another_user_is_refused(self) -> None:
        with patch(f"{FOLDERS}.folder_service.create_folder", side_effect=HTTPException(403, "Access denied")):
            assert self._run({"name": "X", "parent_id": "foreign"}) == "Error: Access denied"

    def test_name_too_long_is_an_error(self) -> None:
        assert self._run({"name": "x" * 500}) == "Error: the folder name is too long."


# ---------------------------------------------------------------------------
# move_items
# ---------------------------------------------------------------------------


class TestMoveItems:
    def _run(self, arguments: dict[str, object]) -> str:
        return execute_tool(MagicMock(), current_user=_user(), tool_name="move_items", arguments=arguments).output

    def test_target_is_required(self) -> None:
        assert "target_folder_id is required" in self._run({"note_ids": ["n1"]})

    def test_needs_at_least_one_item(self) -> None:
        assert "at least one ID" in self._run({"target_folder_id": None})

    def test_moves_notes_and_folders_and_counts_them(self) -> None:
        with patch(f"{FOLDERS}.folder_service") as folder_svc, patch(f"{FOLDERS}.note_service") as note_svc:
            folder_svc.load_folder_map.return_value = {"t": _folder("t", "Target")}
            output = self._run({"note_ids": ["n1", "n2", "n1"], "folder_ids": ["f1"], "target_folder_id": "t"})

        assert note_svc.move_note.call_count == 2  # the duplicate n1 is dropped
        assert note_svc.move_note.call_args.kwargs["folder_id"] == "t"
        assert folder_svc.update_folder.call_args.kwargs["data"].parent_id == "t"
        assert output == "Moved 2 notes and 1 folder to Files > Target."

    def test_null_target_moves_to_the_root(self) -> None:
        with patch(f"{FOLDERS}.folder_service") as folder_svc, patch(f"{FOLDERS}.note_service") as note_svc:
            folder_svc.load_folder_map.return_value = {}
            output = self._run({"note_ids": ["n1"], "target_folder_id": None})

        folder_svc.get_live_folder_or_404.assert_not_called()
        assert note_svc.move_note.call_args.kwargs["folder_id"] is None
        assert output == "Moved 1 note and 0 folders to Files."

    def test_folder_move_to_root_sends_an_explicit_null_parent(self) -> None:
        with patch(f"{FOLDERS}.folder_service") as folder_svc, patch(f"{FOLDERS}.note_service"):
            folder_svc.load_folder_map.return_value = {}
            self._run({"folder_ids": ["f1"], "target_folder_id": None})
        # `update_folder` moves to the root only when parent_id is in `model_fields_set`.
        assert "parent_id" in folder_svc.update_folder.call_args.kwargs["data"].model_fields_set

    def test_items_that_fail_are_skipped_with_the_reason(self) -> None:
        with patch(f"{FOLDERS}.folder_service") as folder_svc, patch(f"{FOLDERS}.note_service") as note_svc:
            folder_svc.load_folder_map.return_value = {"t": _folder("t", "Target")}
            note_svc.move_note.side_effect = [None, HTTPException(403, "Access denied")]
            folder_svc.update_folder.side_effect = HTTPException(400, "A folder cannot be moved into itself")
            output = self._run({"note_ids": ["mine", "foreign"], "folder_ids": ["t"], "target_folder_id": "t"})

        assert output.splitlines() == [
            "Moved 1 note and 0 folders to Files > Target.",
            "Skipped 2:",
            "- note `foreign`: Access denied",
            "- folder `t`: A folder cannot be moved into itself",
        ]

    def test_nothing_moved_when_all_are_skipped(self) -> None:
        with patch(f"{FOLDERS}.folder_service") as folder_svc, patch(f"{FOLDERS}.note_service") as note_svc:
            folder_svc.load_folder_map.return_value = {}
            note_svc.move_note.side_effect = HTTPException(404, "Note not found")
            output = self._run({"note_ids": ["gone"], "target_folder_id": None})
        assert output.splitlines()[0] == "No items were moved."

    def test_target_that_does_not_exist_fails_the_whole_call(self) -> None:
        with (
            patch(
                f"{FOLDERS}.folder_service.get_live_folder_or_404", side_effect=HTTPException(404, "Folder not found")
            ),
            patch(f"{FOLDERS}.note_service") as note_svc,
        ):
            output = self._run({"note_ids": ["n1"], "target_folder_id": "gone"})
        assert output == "Error: Folder not found"
        note_svc.move_note.assert_not_called()

    def test_too_many_items_are_refused(self) -> None:
        assert "at most 100" in self._run({"note_ids": [f"n{i}" for i in range(101)], "target_folder_id": None})


# ---------------------------------------------------------------------------
# list_trash
# ---------------------------------------------------------------------------


def _trash_item(kind: str, id: str, name: str, **kw: object) -> TrashItemRead:
    return TrashItemRead.model_validate(
        {
            "kind": kind,
            "id": id,
            "name": name,
            "deleted_at": datetime.now(timezone.utc) - timedelta(days=3),
            "original_path": "/A/B",
            "folder_count": 0,
            "note_count": 0,
            **kw,
        }
    )


class TestListTrash:
    def _run(self) -> str:
        return execute_tool(MagicMock(), current_user=_user(), tool_name="list_trash", arguments={}).output

    def test_empty_trash(self) -> None:
        with patch(f"{TRASH}.trash_service.list_trash", return_value=[]):
            assert self._run() == "The Trash is empty."

    def test_lists_kind_name_id_path_age_and_counts(self) -> None:
        items = [
            _trash_item("folder", "f1", "Cells", folder_count=2, note_count=5),
            _trash_item("note", "n1", "Mitosis", original_path="/"),
        ]
        with patch(f"{TRASH}.trash_service.list_trash", return_value=items):
            lines = self._run().splitlines()

        assert lines[0] == "Found 2 item(s) in Trash (newest first):"
        assert lines[1] == (
            "- folder **Cells** (ID: `f1`, was in: Files > A > B, deleted 3 d ago, with 2 subfolders and 5 notes)"
        )
        assert lines[2] == "- note **Mitosis** (ID: `n1`, was in: Files, deleted 3 d ago)"

    def test_unknown_original_path(self) -> None:
        with patch(
            f"{TRASH}.trash_service.list_trash", return_value=[_trash_item("note", "n1", "T", original_path=None)]
        ):
            assert "was in: unknown location" in self._run()

    def test_long_list_is_cut(self) -> None:
        items = [_trash_item("note", f"n{i}", f"T{i}") for i in range(60)]
        with patch(f"{TRASH}.trash_service.list_trash", return_value=items):
            lines = self._run().splitlines()
        assert len(lines) == 52
        assert lines[-1] == "…and 10 more."


# ---------------------------------------------------------------------------
# restore_from_trash
# ---------------------------------------------------------------------------


class TestRestoreFromTrash:
    def _run(self, arguments: dict[str, object]) -> str:
        return execute_tool(
            MagicMock(), current_user=_user(), tool_name="restore_from_trash", arguments=arguments
        ).output

    def test_restores_folders_and_notes(self) -> None:
        with patch(f"{TRASH}.trash_service") as svc:
            output = self._run({"items": [{"kind": "folder", "id": "f1"}, {"kind": "note", "id": "n1"}]})

        assert svc.restore_folder.call_args.kwargs["folder_id"] == "f1"
        assert svc.restore_note.call_args.kwargs["note_id"] == "n1"
        assert output == "Restored 2 of 2 item(s): folder `f1`, note `n1`."

    def test_not_found_and_not_owned_items_are_skipped(self) -> None:
        with patch(f"{TRASH}.trash_service") as svc:
            svc.restore_note.side_effect = [
                None,
                HTTPException(404, "Note not found"),
                HTTPException(403, "Access denied"),
            ]
            output = self._run(
                {
                    "items": [
                        {"kind": "note", "id": "ok"},
                        {"kind": "note", "id": "gone"},
                        {"kind": "note", "id": "foreign"},
                    ]
                }
            )

        assert output.splitlines() == [
            "Restored 1 of 3 item(s): note `ok`.",
            "Skipped 2:",
            "- note `gone`: Note not found",
            "- note `foreign`: Access denied",
        ]

    def test_unknown_kind_is_skipped(self) -> None:
        with patch(f"{TRASH}.trash_service") as svc:
            output = self._run({"items": [{"kind": "test", "id": "t1"}]})
        svc.restore_folder.assert_not_called()
        assert output.splitlines() == [
            "No items were restored.",
            "Skipped 1:",
            "- test `t1`: kind must be 'folder' or 'note'",
        ]

    def test_needs_items(self) -> None:
        assert "at least one item" in self._run({"items": []})
        assert "at least one item" in self._run({})


# ---------------------------------------------------------------------------
# Confirm cards
# ---------------------------------------------------------------------------


class TestConfirmContext:
    def _ctx(self, tool: str, arguments: dict[str, object]) -> dict[str, object] | None:
        return build_confirm_context(MagicMock(), tool, arguments, _user())

    def test_tool_without_a_builder_has_no_context(self) -> None:
        assert self._ctx("list_notes", {}) is None
        assert self._ctx("does_not_exist", {}) is None

    def test_create_folder_in_a_folder(self) -> None:
        with patch(f"{FOLDERS}.folder_service.load_folder_map", return_value={"a": _folder("a", "A")}):
            ctx = self._ctx("create_folder", {"name": "X", "parent_id": "a"})
        assert ctx == {"summary": 'Create folder "X" in Files > A'}

    def test_create_folder_at_the_root(self) -> None:
        with patch(f"{FOLDERS}.folder_service.load_folder_map", return_value={}):
            ctx = self._ctx("create_folder", {"name": "X"})
        assert ctx == {"summary": 'Create folder "X" in Files'}

    def test_create_folder_with_an_unknown_parent_does_not_claim_a_place(self) -> None:
        with patch(f"{FOLDERS}.folder_service.load_folder_map", return_value={}):
            ctx = self._ctx("create_folder", {"name": "X", "parent_id": "gone"})
        assert ctx is not None and "parent folder was not found" in str(ctx["summary"])

    def test_move_items_summary_and_names(self) -> None:
        note = MagicMock()
        note.title = "Mitosis"
        folders = {"t": _folder("t", "X"), "f1": _folder("f1", "Old")}
        with (
            patch(f"{FOLDERS}.note_crud.list_live_by_ids", return_value=[note, note, note]),
            patch(f"{FOLDERS}.folder_service.load_folder_map", return_value=folders),
        ):
            ctx = self._ctx(
                "move_items", {"note_ids": ["a", "b", "c"], "folder_ids": ["f1", "foreign"], "target_folder_id": "t"}
            )

        assert ctx is not None
        assert ctx["summary"] == "Move 3 notes and 1 folder to Files > X"
        assert ctx["items"][-1] == {"kind": "folder", "name": "Old"}  # type: ignore[index]
        assert ctx["more_items"] == 0

    def test_move_items_to_root_with_no_owned_items_has_no_context(self) -> None:
        with (
            patch(f"{FOLDERS}.note_crud.list_live_by_ids", return_value=[]),
            patch(f"{FOLDERS}.folder_service.load_folder_map", return_value={}),
        ):
            assert self._ctx("move_items", {"note_ids": ["foreign"], "target_folder_id": None}) is None

    def test_move_items_cuts_the_item_list(self) -> None:
        notes = [MagicMock(title=f"N{i}") for i in range(14)]
        with (
            patch(f"{FOLDERS}.note_crud.list_live_by_ids", return_value=notes),
            patch(f"{FOLDERS}.folder_service.load_folder_map", return_value={}),
        ):
            ctx = self._ctx("move_items", {"note_ids": [f"n{i}" for i in range(14)], "target_folder_id": None})
        assert ctx is not None
        assert len(ctx["items"]) == 10  # type: ignore[arg-type]
        assert ctx["more_items"] == 4

    def test_restore_summary_only_shows_own_trashed_items(self) -> None:
        trashed_folder = _folder("f1", "Cells", parent_id="a")
        trashed_folder.deleted_at = datetime.now(timezone.utc)
        trashed_note = MagicMock(user_id="u1", title="Mitosis", folder_id=None, orphan_path=None)
        trashed_note.deleted_at = datetime.now(timezone.utc)
        foreign_note = MagicMock(user_id="other", title="Secret", folder_id=None, orphan_path=None)
        foreign_note.deleted_at = datetime.now(timezone.utc)
        live_note = MagicMock(user_id="u1", title="Live", folder_id=None, orphan_path=None, deleted_at=None)
        notes = {"n1": trashed_note, "n2": foreign_note, "n3": live_note}

        with (
            patch(f"{TRASH}.folder_service.load_folder_map", return_value={"a": _folder("a", "A")}),
            patch(f"{TRASH}.folder_crud.get_by_id", return_value=trashed_folder),
            patch(f"{TRASH}.note_crud.get_by_id", side_effect=lambda db, id: notes.get(id)),
        ):
            ctx = self._ctx(
                "restore_from_trash",
                {"items": [{"kind": "folder", "id": "f1"}] + [{"kind": "note", "id": i} for i in notes]},
            )

        assert ctx is not None
        assert ctx["summary"] == "Restore 2 items from Trash"
        assert ctx["items"] == [
            {"kind": "folder", "name": "Cells", "detail": "was in Files > A"},
            {"kind": "note", "name": "Mitosis", "detail": "was in Files"},
        ]
