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
| `content`    | The note body, in GFM Markdown                                  |
| `source`     | `USER_CREATED` or `AI_GENERATED`                                |
| `tags`       | Free-form labels for organization                               |
| `version`    | Integer counter, starts at 1, incremented on every content save |
| `is_indexed` | Whether the note has current embeddings in the chunk store      |

Notes track when they were created and when they were last edited.

## The Editor

The note editor is a Notion-style WYSIWYG editor (Tiptap). There is no Edit/View mode toggle. Click anywhere to start typing.

**Markdown input rules**: type the marker and a space — the marker is replaced by rich formatting. For example: `#` + space creates a heading, `**text**` becomes bold, `- ` starts a bullet list.

**Slash menu**: type `/` to open a block picker. Select Text, H1–H3, Bullet, Numbered, To-do, Quote, Code, Divider, or Table with the keyboard or mouse. Esc closes the menu and keeps the `/`.

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

Click "New note" on the notes list. An empty `Untitled` note is created on the server immediately and opened. Edit the title inline. There is no `/notes/new` page.

## Note URLs

Note URLs are Notion-style: `/notes/<title-slug>-<ulid>` (`noteHref()` in `src/lib/routes.ts`). Only the last 26 characters (the ULID) identify the note (`parseNoteId()`), so old links and bare `/notes/<ulid>` links still work. When the title changes, the page updates the address bar with `history.replaceState`. A router navigation could remount the editor.

## Autosave & Conflicts

The editor saves automatically after 1 second of no typing. It also flushes immediately on blur, tab close, and page navigation.

Every `PATCH /notes/{id}` request sends the `version` the client last received. If the server version is higher — another tab or a server-side refinement changed the note — the server returns `409 Conflict`. The client shows a banner with two options: reload the server copy or keep the local edits.

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

A side diff panel (desktop) or bottom drawer (mobile) shows the old and new text. Accept replaces the selected range in the editor. Reject discards the diff without changing the note.

If the note content changed while the AI was processing (for example, the user typed elsewhere), the accept step checks that the selected range still matches the original text. If not, it shows an error and drops the diff.

- Endpoint: `POST /notes/{note_id}/edit-chunk`

## Tags

Tags are free-form strings attached to a note for organization — there is no fixed taxonomy. A user might tag notes by subject ("spanish", "grammar") or by purpose ("exam-prep"). Tags can be added or removed at any time.

Tags show as plain pills below the title, with no outlined field. The "+ Add tag" button opens a borderless input: Enter or `,` adds a tag, Esc cancels, Backspace on an empty input removes the last tag. Hover a pill to see its remove button.
