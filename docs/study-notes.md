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

**Slash menu**: type `/` to open a block picker. Select Text, H1–H3, Bullet, Numbered, To-do, Quote, Code, Divider, or Table with the keyboard or mouse. Esc closes the menu and keeps the `/`. The filter matches the English name and the name in the current language. The slash menu does not open inside code blocks or inline code.

**Code blocks**: highlighted with the `common` lowlight language set. A language chip in the top-right corner (on hover, or while the cursor is in the block) opens a filterable language list. "Auto" (no language) lets lowlight guess the highlight. The language is stored as the fence info string (```` ```python ````). Spell check is off in code (`CodeBlockView.tsx`).

**Width**: on desktop, the BookOpen button next to the save status switches the text column between the 720px reading width and the full page width. One setting per viewer for all notes, in localStorage (`useNoteWidth`). Smaller screens always use the full width.

**Mobile**: the slash menu is placed inside the visual viewport, so the on-screen keyboard does not cover it. On touch devices the bubble menu opens below the selection (the native selection toolbar is above it), and the tag remove buttons are always visible.

**Bubble menu**: select any text to see inline format options. The order is: Color ("A"), Bold, Italic, Strikethrough, Inline code, Link. If AI is configured, two extra buttons appear: "Ask AI" for a chunk edit and "Send to Assistant" to attach the selection to the AI Assistant. Each button shows a hover hint with its name and shortcut (`HoverHint` in `components/ui/hover-hint.tsx`).

**Colors**: the "A" button opens a palette with two groups: text color and background color. The palette is Notion's: gray, brown, orange, yellow, green, blue, purple, pink, red, plus Default to remove the color.

**Layout**: the title, tags, and body sit in a centered column (max 720px), as in Notion. Loading a note is not an undo step, so Cmd/Ctrl+Z after load does not clear the note.

The storage format stays GFM Markdown. Colors are the only exception: GFM has no color syntax, so they are stored as inline HTML with semantic names, not hex:

```md
<span data-color="red">text</span>
<span data-bg="yellow">text</span>
**<span data-color="blue" data-bg="gray">bold, blue on gray</span>**
```

The mark is `NoteColorMark` (`features/notes/editor/noteColor.ts`). Unknown color names are dropped on parse. The AI edit prompts keep these tags. RAG strips them before embedding.

### Typography

All editor styles are in `features/notes/editor/note-editor.css`. Each element (body, H1–H3, lists, quote, code, table, divider) has its own CSS variables at the top of the file (`--note-text-size`, `--note-h1-size`, `--note-table-size`, …). Change a variable there to change how that element looks. The color palette (`--note-<color>` and `--note-<color>-bg`) has values for the light themes and the dark themes.

To check all sizes and colors at once, import `features/notes/editor/__fixtures__/kitchen-sink.md`. It contains every element the editor supports. A unit test also round-trips it.

## Creating Notes

Click "New note" on the notes list. An empty note (empty title, "Untitled" shown only as a placeholder) is created on the server immediately and opened. The list, the export file name and the AI Assistant show "Untitled" for an empty title. Edit the title inline. There is no `/notes/new` page.

## Note URLs

Note URLs are Notion-style: `/notes/<title-slug>-<ulid>` (`noteHref()` in `src/lib/routes.ts`). Only the last 26 characters (the ULID) identify the note (`parseNoteId()`), so old links and bare `/notes/<ulid>` links still work. When the title changes, the page updates the address bar with `history.replaceState`. A router navigation could remount the editor.

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

Deleting a note or a folder moves it to Trash (soft delete). Deleting a folder also trashes all its subfolders and notes in one operation. The confirmation dialog shows the count of items that will be affected.

The `/trash` page lists only the top item of each delete batch — not each descendant individually. Each item shows the delete date, a "Restore" button, and a "Delete forever" button. The page also has an "Empty Trash" action.

### Restore

Restore places the item back in its original parent folder. If that parent no longer exists or is itself in Trash, the item goes to the root. A restored folder brings back only the items that were trashed in the same delete batch — items the user trashed separately before that delete are not restored.

### Purge (30 days)

Items stay in Trash for 30 days. They are then deleted permanently. Purge is lazy: `GET /trash` hard-deletes all items where `deleted_at < now() - 30 days` before returning the list. No scheduler is needed.

### Trashed note URL

Opening the URL of a trashed note shows the note in read-only mode with a banner "This note is in Trash" and a Restore button. Autosave is disabled. Any `PATCH` to a trashed note returns `409 Conflict` ("Note is in Trash") so the UI can distinguish the reason from a version conflict.

Trashed notes are hidden everywhere: Files page, All Notes list, dashboard, stats, semantic search, AI Assistant tools, and test generation.
