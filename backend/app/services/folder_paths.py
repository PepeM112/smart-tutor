"""Pure folder-path builders.

Given the folders of a user in one in-memory map, build the path of any item.
No DB access here: load the map once per request (`folder_service.load_folder_map`)
and call `build_folder_path` for every item. This avoids one query per item.

A path is a list of folder names (outermost first), not a joined string: a folder name can
contain "/", so only the caller knows how to show it (the Trash joins with "/", the
assistant with " > ").
"""

from collections.abc import Mapping

from app.models.folder import Folder


def _chain_names(folders: Mapping[str, Folder], *, start_id: str | None, stop_id: str | None = None) -> list[str]:
    """Return the names from the top of the chain down to `start_id` (outermost first).

    The walk goes up from `start_id` over `parent_id`. A folder in the chain can carry its own
    `orphan_path`: those names sit between it and its parent, so they come before its name.
    The walk stops after `stop_id` (its `orphan_path` is included), at a folder that is not
    in `folders`, or at a cycle.
    """
    parts: list[str] = []  # innermost first; reversed at the end
    current_id: str | None = start_id
    seen: set[str] = set()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        folder = folders.get(current_id)
        if folder is None:
            break
        parts.append(folder.name)
        parts.extend(reversed(folder.orphan_path or []))
        if current_id == stop_id:
            break
        current_id = folder.parent_id
    return parts[::-1]


def build_folder_path(
    folders: Mapping[str, Folder],
    *,
    folder_id: str | None,
    orphan_path: list[str] | None = None,
) -> list[str] | None:
    """Return the location of an item as folder names, e.g. ["A", "B", "C"], or None for root.

    `folder_id` is the current parent of the item (live or trashed). `orphan_path` holds the
    names of folders that were deleted forever below that parent; they are added at the end,
    so the path shows the real place. A missing folder ends the walk, so an unknown
    `folder_id` gives [].
    """
    if folder_id is None and not orphan_path:
        return None
    return [*_chain_names(folders, start_id=folder_id), *(orphan_path or [])]


def build_orphan_path(
    batch_folders: Mapping[str, Folder],
    *,
    top_id: str,
    start_id: str,
    existing: list[str] | None,
) -> list[str]:
    """Return the new `orphan_path` of an item that moves from `start_id` to the parent of `top_id`.

    `batch_folders` holds the folders that are deleted forever (the batch of `top_id`). The
    result has the `orphan_path` of `top_id` (older lost names above it), the names from
    `top_id` down to `start_id`, and then `existing` (the older path below `start_id`).
    All of them are lost with the batch, so restore must rebuild them in this order.
    """
    return [*_chain_names(batch_folders, start_id=start_id, stop_id=top_id), *(existing or [])]
