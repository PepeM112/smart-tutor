# Study Notes

## What Notes Are

A note is a standalone Markdown document used for study material — reading and reference, not assessment. Notes exist outside the Test/Question hierarchy: a user might write a note summarizing a grammar topic, or generate one on a historical period, without ever turning it into a test.

Notes serve two purposes:

1. **Reference material** — something to read and revisit.
2. **Source material for test generation** — a note's content can be handed to the AI to produce a set of questions (see [AI Test Generation](test-generation.md)).

## The Note Entity

| Field        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `title`      | Short name, up to 200 characters                                |
| `content`    | The note body, in GFM Markdown, up to 50,000 characters         |
| `source`     | `USER_CREATED` or `AI_GENERATED`                                |
| `tags`       | Free-form labels for organization (max 10, 25 characters each)  |
| `version`    | Integer counter, starts at 1, incremented on every content save |
| `is_indexed` | Whether the note has current embeddings in the chunk store      |

Notes track when they were created and when they were last edited.

## The Editor

The note editor is a Notion-style WYSIWYG editor (Tiptap). There is no Edit/View mode toggle. Click anywhere to start typing.

**Markdown input rules**: type the marker and a space — the marker is replaced by rich formatting. For example: `#` + space creates a heading, `**text**` becomes bold, `- ` starts a bullet list.

**Slash menu**: type `/` to open a block picker. Select Text, H1–H3, Bullet, Numbered, To-do, Quote, Code, Divider, Callout, Toggle, or Table with the keyboard or mouse. Esc closes the menu and keeps the `/`. The filter matches the English name and the name in the current language. The slash menu does not open inside code blocks or inline code.

**Code blocks**: highlighted with the `common` lowlight language set. A language chip in the top-right corner (on hover, or while the cursor is in the block) opens a filterable language list. "Auto" (no language) lets lowlight guess the highlight. The language is stored as the fence info string (```` ```python ````). Spell check is off in code (`CodeBlockView.tsx`).

Code aliases (`py`, `js`, `yml`...) become the canonical name (`python`) when typed, pasted, loaded or picked. The code toolbar also has Copy and a view-only Wrap toggle (`codeLanguages.ts`).

**Links**: hover or click a link for a popover with the URL, open, edit, copy and remove. Cmd/Ctrl+click opens it (`link/`).

**To-do nesting**: Tab / Shift+Tab indent and outdent a to-do. Saved as `- [ ]` with 2 spaces per level.

**Callout**: a colored box (note, tip, important, warning, caution). Saved as a GitHub alert: `> [!TIP]` alone on the first line, then `> `-prefixed lines. Other Markdown viewers show a plain quote. The icon menu changes the type.

**Toggle**: a collapsible section. Saved as `<details><summary>Title</summary>`, a blank line, the Markdown content, a blank line, `</details>`. The parser also accepts it without blank lines, on one line, and nested. Open or closed is view-only and never saved. Embeddings drop the marker line and the tags and keep the text.

**Block handle**: on desktop, a "+" and a 6-dot grip show left of the block under the pointer. A block is a direct child of the document, so a list, quote, callout, toggle or table moves as a whole. Drag the grip to reorder (a line shows the drop place). Click it for Turn into (text, H1–H3, bullet, numbered, to-do, quote, code, callout, toggle), Duplicate and Delete. "+" adds an empty paragraph below and opens the slash menu in it. A table or a divider cannot be turned into another block. Each action is one undo step, and none of them changes the saved Markdown format. Code: `features/notes/editor/block/` (`blockCommands.ts` pure transaction builders, tested; `blockGeometry.ts`; `useBlockOverlay.ts` hover and lock like the table overlay; `BlockHandle.tsx`). The drag reuses `table/useGripDrag.ts`. For a table block the handle sits left of the table menu button (no overlap). While the menu is open the block is selected (soft outline, no text bubble menu). The overlay is hidden on touch and below `md`.

**Width**: on desktop, the BookOpen button next to the save status switches the text column between the 720px reading width and the full page width. One setting per viewer for all notes, in localStorage (`useNoteWidth`). Smaller screens always use the full width.

**Mobile**: the slash menu is placed inside the visual viewport, so the on-screen keyboard does not cover it. On touch devices the bubble menu opens below the selection (the native selection toolbar is above it), and the tag remove buttons are always visible.

**Bubble menu**: select any text to see inline format options. The order is: Color ("A"), Bold, Italic, Strikethrough, Inline code, Link. If AI is configured, two extra buttons appear: "Ask AI" for a chunk edit and "Send to Assistant" to attach the selection to the AI Assistant. Each button shows a hover hint with its name and shortcut (`HoverHint` in `components/ui/hover-hint.tsx`).

**Colors**: the "A" button opens a palette with two groups: text color and background color. The palette is Notion's: gray, brown, orange, yellow, green, blue, purple, pink, red, plus Default to remove the color.

**Layout**: the title, tags, and body sit in a centered column (max 720px), as in Notion. Loading a note is not an undo step, so Cmd/Ctrl+Z after load does not clear the note.

The storage format stays Markdown. Colors and tables are the exceptions: GFM has no color syntax, so they are stored as inline HTML with semantic names, not hex:

```md
<span data-color="red">text</span>
<span data-bg="yellow">text</span>
**<span data-color="blue" data-bg="gray">bold, blue on gray</span>**
```

The mark is `NoteColorMark` (`features/notes/editor/noteColor.ts`). Unknown color names are dropped on parse. The AI edit prompts keep these tags. RAG strips them before embedding.

**Tables** are saved as HTML, because GFM pipe tables cannot hold column widths, cell colors or several paragraphs in a cell. Default attributes are left out:

```html
<table data-layout="full">
<tr>
<th colwidth="120" data-bg="gray">Name</th>
<th>Score</th>
</tr>
<tr>
<td data-color="red"><strong>Ana</strong></td>
<td></td>
</tr>
</table>
```

- `data-layout`: `compact` (default, columns keep their width) or `full` (table fills the editor). Node attribute `layout` on the table.
- `colwidth`: column width in px, on every cell of the column. Double-click on the resize handle removes it (one undo step). `resetColumnWidth.ts` finds the double-click from two `mousedown` events on the edge (500ms, 4px) and runs before the resize plugin, so no second drag writes the width again. `noteTableView.ts` clears the stale inline `width` of the `<col>` (Tiptap leaves it when a width is removed). The resize line is one widget per cell; CSS joins them into one continuous line (each covers its bottom border, only the ends are round). Bars are centered on the middle of the 1px border (`BORDER_CENTER`).
- `data-color` / `data-bg`: Notion palette names on `td`/`th`. Node attributes `color` and `bg`. Set them with `editor.commands.setCellAttribute('color' | 'bg', NoteColor | null)`.
- Cell content is inline HTML (`<strong>`, `<em>`, `<a href>`, color `<span>`...). A cell with one paragraph has no `<p>`. Several blocks use `<p>`, lists and code blocks. A blank line ends an HTML block in Markdown, so blank lines inside a cell are written as `&#10;`.
- Old GFM pipe tables still load. They are saved as HTML the first time the note is saved. `<`, `>` and `&` in cells are escaped.
- Code: `features/notes/editor/table/` (`noteTable.ts` extensions, `tableHtml.ts` serializer, `noteTableView.ts`, `resetColumnWidth.ts`). Table colors come from `--note-table-*` tokens in `note-editor.css` (light, and one set per dark theme).
- Table controls: `table/TableControls.tsx` is an overlay in the editor container. It shows only when the editor is editable. It is not part of the document, so nothing is saved or serialized. The position comes from the DOM of the table under the pointer (or the table with the selection), and updates on scroll, resize and transaction (one `requestAnimationFrame` per frame). Pointer hover counts in a zone of about 30px around the table, so the pointer can reach handles outside it. The table handle also shows while the pointer is in the full row band of the table, across the whole editor width and up to 56px left of the table (`TABLE_MENU_REACH`), so the pointer can reach the handle in the page padding. The pointer is tracked on `window` for this reason; moves far from the editor are ignored. On touch there is no hover: the handles show for the table that holds the selection. While a menu is open or a drag runs, the control locks the overlay (the table and the hovered cell stay fixed). The lock has an owner (`useId` of the control), and only that owner can release it: a pointer down on a grip closes the open menu of another control, and that close must not release the lock of the new drag.
  - Table handle (32px ghost button with a 6-dot icon, left of the header row, 12px from the table): Full width toggle, Add row, Add column, Delete table.
  - "+" bars (right and bottom edge): add a column or row at the end.
  - Column handle (center of the top border) and row handle (middle of the left border): a thin bar at rest (look of the `SplitPane` divider) that becomes the grip icon on hover (120ms, no motion with reduced motion). Click selects the whole column or row (`CellSelection`) and opens a menu (Color, Insert before / after, Clear, Delete). Drag with pointer events shows a drop line and moves the line on drop (`moveTableColumn` / `moveTableRow`). Esc cancels. Widths and colors move with the cells.
  - Cell handle (a bar ON the right border of the cell, dots icon on hover): Color, Clear. Opening the menu selects the cell (highlighted like a column or row). The bar wins the click where it overlaps the resize edge. The edge stays free above and below the bar and in the other rows. The overlay hides while a resize drag runs.
  - Header row: it cannot be deleted or dragged, nothing can be inserted above it and no row can be dropped above it. The move keeps the cell type by position, so a drop above it would put `td` above `th`. The last column and the last row cannot be deleted. "Clear" removes the content and keeps the cells, widths and colors.
  - Each action is one transaction (one undo step). A move is two dispatches (select, then move) and one undo reverts it. After an action the focus goes back to the editor.
  - Limits: a table with merged cells shows only the table handle. There is no autoscroll during a drag. The table handle goes above the table when there is no room at the left of it.
  - Code: `tableCommands.ts` (pure transaction builders, tested), `tableGeometry.ts` (pure hover and drop math, tested), `useTableOverlay.ts`, `useGripDrag.ts`, `TableMenus.tsx`.
- RAG: `embedding_service.clean_note_for_embedding()` turns each table into text (cells joined by ` | `, rows by newlines) and then strips color spans. The AI edit prompts tell the model to keep `<table>` HTML and its attributes, and to write new tables as pipe tables.

- Outline rail and heading anchors (`features/notes/editor/outline/`): on the note page only (`RichNoteEditor` gets `noteId`; the diff and preview editors do not, so ids are never repeated on a page).
  - Heading ids: `headingAnchors.ts` is a ProseMirror plugin with node decorations. The id is a slug of the heading text (`slug.ts`: lowercase, no accents, letters and digits of any script, `-` between words). A repeated slug gets `-2`, `-3`. The id exists only in the DOM. It is not in the document and not in the Markdown, so AI, RAG and saved notes do not change.
  - Rail (`NoteOutline.tsx`): an overlay in the editor container like the table controls. It is `absolute` to the right of the column and takes no layout space, and it is `sticky` near the top of the scroll area. Dashes: width by level (H1 longest), the active one is highlighted. Hover or keyboard focus opens a card with the headings indented by level. A click smooth-scrolls (instant with reduced motion). Each item has a copy-link button (`/notes/{id}#slug` + toast). Esc closes the card.
  - It is hidden below `lg`, with fewer than 2 headings, and when the space between the column and the scroll area is less than 40px (`MIN_RAIL_SPACE`: full width on a narrow window, or the diff panel is open). The space is measured from the DOM, so it follows the split pane.
  - The note page scrolls an inner pane, not the window. `findScrollParent` (`scroll.ts`) finds the scroll container, and the active heading comes from its scroll position (last heading above 96px from the top; the last heading when scrolled to the end).
  - `/notes/{id}#slug` scrolls to the heading when the page loads and on `hashchange` (`useScrollToHash.ts`). A heading in a closed toggle has no box and is not scrolled to.

### Typography

All editor styles are in `features/notes/editor/note-editor.css`. Each element (body, H1–H3, lists, quote, code, table, divider) has its own CSS variables at the top of the file (`--note-text-size`, `--note-h1-size`, `--note-table-size`, …). Change a variable there to change how that element looks. The color palette (`--note-<color>` and `--note-<color>-bg`) has values for the light themes and the dark themes.

To check all sizes and colors at once, import `features/notes/editor/__fixtures__/kitchen-sink.md`. It contains every element the editor supports. A unit test also round-trips it.

## Creating Notes

Click "New note" on the notes list. An empty note (empty title, "Untitled" shown only as a placeholder) is created on the server immediately and opened. The list, the export file name and the AI Assistant show "Untitled" for an empty title. Edit the title inline. There is no `/notes/new` page.

## Note URLs

Note URLs are Notion-style: `/notes/<title-slug>-<ulid>` (`noteHref()` in `src/lib/routes.ts`). Only the last 26 characters (the ULID) identify the note (`parseNoteId()`), so old links and bare `/notes/<ulid>` links still work. When the title changes, the page updates the address bar with `history.replaceState`. A router navigation could remount the editor. The hash stays, and `#<heading-slug>` scrolls to that heading (see the outline rail in "The Editor").

## Autosave & Conflicts

The editor saves automatically after 1 second of no typing. It also flushes immediately on blur, tab close, and page navigation.

Every `PATCH /notes/{id}` request sends the `version` the client last received. If the server version is higher — another tab or device changed the note — the server returns `409 Conflict`. AI refinement and chunk edits never write the note on the server: the user accepts the diff in the editor, and autosave saves it. The client shows a banner with two options: reload the server copy or keep the local edits. A `422` (the note is over a backend limit, see Limits) shows "Note too long" in the save status. Autosave does not retry it; the next edit saves again. The draft state, autosave wiring and conflict handling live in `useNoteDraft` (`features/notes/hooks/useNoteDraft.ts`). `NoteForm` only does the layout and the AI diff panels.

Embedding reindex is deferred: autosaves only set `is_indexed = false`. The index is rebuilt (a) when the user leaves the note (`PATCH` with `reindex: true`) and (b) lazily at the start of a semantic search for any stale notes of that user.

## Importing Notes

An existing `.md` file can be imported directly. The note is created on the server and opened in the editor.

## AI Note Generation

Instead of writing from scratch, a user can ask the AI to draft a note. The request includes:

- A **topic** (required)
- Optional **guidance** — focus areas, or things to include or exclude
- A **length** preference: short, medium, or long

The AI produces structured Markdown content covering the topic. The note is saved and opened in the editor. Notes created this way are tagged `AI_GENERATED` so their origin stays visible.

## AI Note Refinement

Once a note exists — whether written by hand or generated — the user can ask the AI to revise it. The user describes the change in free text (e.g. "shorten the introduction," "add a section on exceptions"). The AI returns an updated version of the content.

A side diff panel shows the old and new versions. The user accepts or rejects. On accept, the editor updates in place — no remount, no reload.

Refinement operates on the note as a whole. It is also exposed as an AI Assistant tool (`refine_note`) — see [AI Assistant](ai-assistant.md#tools).

## AI Chunk Editing

Refinement changes the whole note. Chunk editing changes one part.

Select any text in the editor. The bubble menu shows an "Ask AI" button. Click it to open a small instruction input. Esc or a click outside closes it (not while the request runs). Describe the change (e.g. "make this sentence clearer"). The AI receives the full note content, the selected chunk, and the instructions. It returns an edited version of the chunk only.

When the request starts, the selected text gets a highlight (`editor/chunkHighlight.ts`). The highlight is a ProseMirror decoration: it is not saved in the markdown and it is not in the undo history. It follows the text while the user types in other parts of the note. A new chunk edit cannot overlap a highlight that is already there.

When the result is ready, a side diff panel (desktop) or bottom drawer (mobile) shows the old and new text. Accept replaces the highlighted text. Reject discards the diff without changing the note. Both remove the highlight. Close (X, or closing the drawer) keeps the diff and the highlight: click the highlight to open the diff again. Many chunk diffs can wait at the same time.

At accept, the text in the highlight must still match the original text (the user can edit inside the highlight, or delete it). If not, it shows an error and drops the diff.

If the AI output is cut off at the token limit, the endpoint returns 422 and the UI shows "select a smaller part". The output limit is sized from the input length (`_edit_max_tokens` in `note_service.py`, max 16,384). Refinement uses the same check.

- Endpoint: `POST /notes/{note_id}/edit-chunk`

## Tags

Tags are free-form strings attached to a note for organization — there is no fixed taxonomy. A user might tag notes by subject ("spanish", "grammar") or by purpose ("exam-prep"). Tags can be added or removed at any time.

Tags show as plain pills below the title, with no outlined field. The "+ Add tag" button opens a borderless input: Enter or `,` adds a tag, Esc cancels, Backspace on an empty input removes the last tag. Hover a pill to see its remove button.

**Limits**: at most 10 tags per note, 25 characters per tag. The backend (`NoteCreate` / `NoteUpdate` in `schemas/note.py`) trims, lowercases and removes empty and duplicate tags, then rejects a list over the limits with a 422. The UI enforces the same limits: the input stops at 25 characters, and "+ Add tag" is hidden when the note has 10 tags. The limits are only on input schemas, so `NoteRead` can still return an older note that is over them. The content limit (50,000 characters) also applies to `fullText` and `selectedText` of the AI chunk edit.

## Folders

A note can belong to one folder, or sit at the root (`folder_id = NULL`). Folders form an adjacency list: each folder has an optional `parent_id` pointing to another folder of the same user. There is no depth limit.

Folder names are unique among live siblings (case-insensitive). The same name is allowed when the only conflict is a trashed folder. The server checks uniqueness with a partial unique index (`WHERE deleted_at IS NULL`).

The note page shows the folder path as breadcrumbs. The user can move the note to a different folder from the note page without affecting autosave — the move endpoint (`POST /notes/{id}/move`) changes `folder_id` only and does not increment `note.version`, so the open editor does not receive a `409 Conflict`.

New notes created via "New note", import, and AI generation from inside a folder are saved in that folder.

## Files Page

The `/files` page is the primary folder view. It shows the subfolders and notes of the current folder with breadcrumbs to the root. Folders are listed first, then notes, both in alphabetical order.

From this page the user can:
- Create a subfolder.
- Create a new note, import a `.md` file, or generate a note with AI — all saved in the current folder.
- Rename, move (a folder-picker dialog), or delete (to Trash) any item.

The flat note list at `/notes` ("All Notes") remains as a secondary view with sort and filters. It shows the folder of each note as a link.

Folder URLs follow the same slug pattern as notes: `/files/<name-slug>-<ulid>` (`folderHref()` in `src/lib/routes.ts`). The ULID is the canonical identifier; the slug part is cosmetic and updated with `history.replaceState` when the folder is renamed.

## Trash

Deleting a note or a folder moves it to Trash (soft delete). Deleting a folder also trashes all its subfolders and notes in one operation. The confirmation dialog has a fixed text (no counts). The client decides which one to show from the file tree it already has (`hasChildItems`), so the text never changes after the dialog opens.

**Empty folder:** a folder with no live subfolders and no live notes is deleted forever, not trashed. The dialog says so. `DELETE /folders/{id}` returns `{ outcome: "trashed" | "deleted" }`, and the toast "Undo" creates the folder again (same name, same parent) when the outcome is `deleted`. Trashed items of earlier batches inside the folder survive: they move to the parent and keep an `orphan_path` (same rule as "Delete forever", see Restore).

The `/trash` page lists only the top item of each delete batch — not each descendant individually. The list is the same tree table as `/files` (shared `TreeRowShell`, `TreeChevron`, `TreeHeaderRow`, `TreeActionsCell`) with the columns Name, Original location and Deleted (relative time). Hover actions on each row: Restore and Delete forever. There is no drag and drop. The page also has an "Empty Trash" action.

A folder row can be expanded to show the items that were trashed with it (`GET /trash/folders/{id}/tree`, flat lists like `GET /folders/tree`, same `deleted_at` only). Each item in that tree has its own "Restore" and "Delete forever". Restore of a sub-item brings back its trashed ancestors as rows only; the remaining siblings become separate Trash entries. Delete forever of a sub-item lowers the counts of the top item.

### Restore

Restore rebuilds the original path of the item:

- **Parent is still in Trash:** the trashed ancestors are restored too, but only the folder rows. Their other contents stay in Trash and appear as separate Trash entries. If the topmost restored ancestor clashes with a live sibling name, it is renamed (`(restored)`, `(2)`, ...).
- **Parent was deleted forever:** when a folder is deleted forever, items of other batches inside it are moved to the parent of that folder and keep the names of the lost folders in `orphan_path` (outermost first). On restore, each name is reused if a live folder with that name (case-insensitive) exists at that level, or created. The item goes in the last folder and `orphan_path` is cleared.
- The Trash page shows the full original path, including the `orphan_path` names.
- A restored folder brings back only the items that were trashed in the same delete batch — items the user trashed separately before that delete are not restored.
- **Name conflict → rename.** Restore never fails on a name clash. If a live sibling in the target folder has the same name (case-insensitive), the restored folder gets the suffix ` (restored)`, then ` (2)`, ` (3)`, ... until the name is free. Long names are shortened first, so the result fits the 100-character limit. The same rule applies to each restored ancestor folder. Notes are not renamed: note titles do not have to be unique. The endpoint returns 204, so the UI does not show the new name.

### Purge (30 days)

Items stay in Trash for 30 days. They are then deleted permanently. Purge is lazy: `GET /trash` hard-deletes all items where `deleted_at < now() - 30 days` before returning the list. No scheduler is needed. Until the purge runs, an item that is older than 30 days already acts as gone: `GET /notes/{id}`, restore and "Delete forever" return 404 for it (`is_trash_expired` in `service_helpers.py`, constant `TRASH_RETENTION_DAYS`).

### Trashed note URL

Opening the URL of a trashed note shows the note in read-only mode with a banner "This note is in Trash" and a Restore button. Autosave is disabled. Any `PATCH` to a trashed note returns `409 Conflict` ("Note is in Trash") so the UI can distinguish the reason from a version conflict.

Trashed notes are hidden everywhere: Files page, All Notes list, dashboard, stats, semantic search, AI Assistant tools, and test generation.
