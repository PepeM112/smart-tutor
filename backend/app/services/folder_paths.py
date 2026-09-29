"""Pure folder-path builder.

Given ALL folders of a user in one in-memory map, build the display path of any item.
No DB access here: load the map once per request (`folder_service.load_folder_map`)
and call `build_folder_path` for every item. This avoids one query per item.
"""

from collections.abc import Mapping

from app.models.folder import Folder


def build_folder_path(
    folders: Mapping[str, Folder],
    *,
    folder_id: str | None,
    orphan_path: list[str] | None = None,
) -> str | None:
    """Return the location of an item as "/A/B/C", or None for root.

    `folder_id` is the current parent of the item (live or trashed). `orphan_path` holds the
    names of folders that were deleted forever below that parent; they are added at the end,
    so the path shows the real place. A folder in the chain can carry its own `orphan_path`:
    those names sit between it and its parent. A missing folder (or a cycle) ends the walk.
    """
    if folder_id is None and not orphan_path:
        return None
    parts: list[str] = []  # innermost first; reversed at the end
    current_id: str | None = folder_id
    seen: set[str] = set()
    while current_id is not None and current_id not in seen:
        seen.add(current_id)
        folder = folders.get(current_id)
        if folder is None:
            break
        parts.append(folder.name)
        parts.extend(reversed(folder.orphan_path or []))
        current_id = folder.parent_id
    names = [*reversed(parts), *(orphan_path or [])]
    return "/" + "/".join(names)
