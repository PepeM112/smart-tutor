# AI Assistant

## Overview

The Assistant is a floating/dockable chat panel available on every authenticated page. It can answer questions about the user's own content (including semantic search via RAG), navigate the app on the user's behalf, create or edit notes and tests, and organise Files (create folders, move items) and the Trash (list, restore). A write tool pauses for approval only when its `ToolSpec` has `requires_confirmation=True`. Today only `edit_test` does. All other write tools, including `create_folder`, `move_items` and `restore_from_trash`, execute immediately; the assistant says what it changed in its reply, and the user can review the result on the resource's own page.

It is AI feature #7 (`AIFeature.ASSIST`), and shares the same per-user provider/API-key infrastructure as the other six features described in [AI Features](ai-features.md) (Anthropic Claude Haiku 4.5 / OpenAI GPT-4o-mini, per-user encrypted keys, `get_user_llm_client`). What makes it different is the interaction shape: the other six features call `LLMClient.complete()` once and get a single structured response back. The Assistant calls `LLMClient.stream_with_tools()` — a streaming, multi-round, agentic tool-use loop — because a chat turn can involve the model reading data, calling tools, and replying incrementally rather than in one shot.

## Where It Lives

| Layer    | Files                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | `api/v1/endpoints/assist.py`, `schemas/assist.py`, `services/assist_service.py`, `services/assist_tools/` (package), `services/assist_prompts.py` |
| Frontend | `frontend/src/features/assist/` (hooks, components, store, context, extensions, utils), mounted once in `frontend/app/(app)/layout.tsx`                                     |

The frontend does not call the backend directly. It calls a dedicated Next.js Route Handler, `frontend/app/api/v1/assist/route.ts`, which forwards the request body and cookies to the backend and pipes the upstream SSE body straight through to the browser. This is a hand-written passthrough rather than the generic `next.config` rewrite proxy used elsewhere (see [Same-Origin API Proxy](decisions.md#same-origin-api-proxy-over-cross-origin-cookies)) — a `rewrites()` rule can't stream a response body, and SSE requires the connection to stay open and flush incrementally.

## Request / Response Contract

`POST /api/v1/assist` (auth required, same `get_current_user` dependency as every other endpoint). Response is a `StreamingResponse` with `media_type="text/event-stream"`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.

**Request body (`AssistRequest`):**

| Field                | Type                            | Description                                                              |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `messages`           | `AssistMessage[]`                | Full conversation so far (see [Conversation Persistence](#conversation-persistence)) |
| `pageContext`        | `PageContext \| null`            | What the user is currently looking at (see [Page Context](#page-context))  |
| `toolConfirmations`  | `ToolConfirmation[] \| null`     | Approve/reject decisions for a previously paused write tool                |

`AssistMessage`: `role` (`user` / `assistant` / `tool`), `content`, optional `toolCalls`, optional `toolResults`.

`PageContext`: `route`, `resourceType`, `resourceId`, `contextData` (free-text).

`ToolConfirmation`: `toolCallId`, `approved`.

## SSE Event Protocol

Every event is written as `event: <name>\ndata: <json>\n\n`.

| Event              | Payload                                                                | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `text_delta`        | `{ content }`                                                              | An incremental chunk of assistant text                                                        |
| `tool_call`         | `{ id, name, arguments }`                                                  | A tool call finished streaming and is ready to run                                            |
| `tool_executing`    | `{ id, name }`                                                             | Emitted only when re-running a previously-approved write tool after confirmation              |
| `tool_result`       | `{ id, name, output, metadata? }`                                          | Result of an auto-executed read tool, or of an approved write tool                             |
| `confirm_required`  | `{ id, name, arguments, context? }`                                        | A write tool is paused pending user approval; `context` is a backend-resolved before/after preview built by the tool's optional `confirm_context` (populated for `edit_test`) |
| `done`              | `{ usage: { inputTokens, outputTokens }, pendingConfirmations? }`          | End of this HTTP stream; `pendingConfirmations` is present when the loop paused for approval  |
| `error`             | `{ message }`                                                              | A classified provider error, or "too many tool rounds"                                        |

Tool call arguments are never streamed incrementally — both the Anthropic and OpenAI implementations of `stream_with_tools()` accumulate the tool-call JSON internally and only emit `tool_call` once it's complete. Only text is truly incremental.

**Shape of one request/response cycle:** `text_delta*` interleaved with (`tool_call` → auto `tool_result`) for read tools, repeated across rounds, ending either in `done` (nothing left to do) or in one-or-more `confirm_required` events followed by `done{pendingConfirmations}` (a write tool needs approval — this always ends the stream, even if read tools also ran that round).

## Tools

Defined in the package `services/assist_tools/`. Each tool is one frozen `ToolSpec` (`name`, `description`, `input_schema`, `handler`, `requires_confirmation`, optional `confirm_context`), placed next to its handler:

| Module          | Tools                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| `notes.py`      | `list_notes`, `search_user_notes`, `get_note_content`, `create_note`, `refine_note` |
| `tests.py`      | `list_tests`, `get_test_details`, `create_test`, `edit_test`                   |
| `questions.py`  | `search_questions`, `refine_questions`                                         |
| `folders.py`    | `list_folders`, `create_folder`, `move_items`                                  |
| `trash.py`      | `list_trash`, `restore_from_trash`                                             |
| `navigation.py` | `navigate_to`                                                                  |
| `types.py`      | `ToolSpec`, `ToolResult`, `ToolHandler`, metadata schemas (no imports from the other modules, so no import cycle) |
| `_helpers.py`   | Shared label and list helpers                                                  |
| `registry.py`   | `TOOLS` (name to spec; duplicate names raise at import), `get_tool_definitions_anthropic/openai`, `requires_confirmation(name)`, `build_confirm_context`, `execute_tool` |

To add a tool: write the handler and `ToolSpec` in the domain module, then add the spec to `_SPECS` in `registry.py`. The loop in `assist_service.py` reads the confirmation rule from the registry, so it needs no change. The frontend mirrors each tool in `utils/toolRegistry.ts` (label, icon, queries to invalidate).

| Tool                  | Kind  | Confirmation | Purpose                                                        |
| ---------------------- | ----- | ------------ | ----------------------------------------------------------------- |
| `list_notes`           | read  | no           | List the user's live notes; each result has a `location`               |
| `list_folders`         | read  | no           | List the user's live folders (flat; client builds the tree)       |
| `list_tests`           | read  | no           | List the user's tests                                             |
| `get_note_content`     | read  | no           | Full content of one live note, with its `location`                      |
| `get_test_details`     | read  | no           | A test plus its questions, with IDs                               |
| `search_questions`     | read  | no           | Search the question bank                                          |
| `search_user_notes`    | read  | no           | Semantic search across user's live notes via RAG embeddings       |
| `navigate_to`          | read* | no           | Route the user's browser to an allowed page                       |
| `create_note`          | write | no***        | AI-generate a new note from a topic; accepts an optional folder   |
| `create_test`          | write | no***        | AI-generate a test from a note                                     |
| `edit_test`            | write | **yes**      | Rename/describe a test, or remove questions from it                |
| `refine_note`          | write | no**         | AI-revise an existing note (produces a reviewable diff)             |
| `refine_questions`     | write | no**         | AI-edit specific questions in a test (produces a reviewable diff)   |
| `create_folder`        | write | no           | Create a folder, in the root or under a parent folder              |
| `move_items`           | write | no           | Move notes and folders to a target folder (or the root); skips items that cannot move |
| `list_trash`           | read  | no           | List trashed items: kind, name, ID, original location, age, counts  |
| `restore_from_trash`   | write | no           | Restore trashed folders and notes by `{kind, id}`                  |

**Location:** tools show where an item is as `location`, in the words of the app UI: `Files` (root) or `Files > A > B`. They do not show `/A/B` paths.

**Trashed notes** are excluded from all tools. `search_user_notes` filters the RAG chunk search to live notes only. `get_note_content` refuses to return a trashed note. `list_notes` and `list_folders` only show live items.

\* `navigate_to` is auto-executed like a read tool (no server-side pause), but it has a client-side side effect: it tells the frontend to route the user somewhere. It's restricted to an allowlist of route prefixes (`_ALLOWED_ROUTE_PREFIXES` in `assist_tools/navigation.py`: `/dashboard /notes /tests /questions /review /history /settings /stats /files /trash`); anything else falls back to `/dashboard`.

\*\* `refine_note` and `refine_questions` do **not** set `requires_confirmation`, so they execute immediately without a `confirm_required` pause. This is intentional: their output is naturally reviewable as an old/new diff, so the frontend shows a lightweight "view changes → accept/reject" flow instead of an upfront yes/no gate (see [Diff Review Flow](#diff-review-flow-refine_note--refine_questions) below). The tradeoff is that the AI writes before the user has seen anything — acceptable here because both are reversible (the diff panel can reject, and `edit_test`'s question removals get their own undo toast — see below).

\*\*\* `create_note` and `create_test` also execute immediately without confirmation. The system prompt instructs the model to call them directly when intent is clear — the user is taken to the edit page to review the result, so the output is naturally inspectable without a gate. Only `edit_test` sets `requires_confirmation=True` and gets a `confirm_required` pause, because it modifies existing content in place. The Files and Trash tools (`create_folder`, `move_items`, `restore_from_trash`) run at once: they only change where items are, and the user can undo them from the Files and Trash pages.

\*\*\*\* `move_items` and `restore_from_trash` work per item: one item that cannot move or restore (not owned, not found, would create a cycle, name clash) is skipped with a reason, and the other items still go through. Delete-forever is not an Assistant tool; it stays in the Trash UI. "Move these notes into a new folder X" runs `create_folder`, then `move_items`, in one stream with no approval step.

## Agentic Loop

`stream_assist` in `assist_service.py` runs up to `MAX_TOOL_ROUNDS = 6` rounds, each capped at `MAX_TOKENS = 4096`:

1. Call `llm.stream_with_tools(system, messages, tools, max_tokens)` — a generator that yields text deltas and returns a final `StreamResult` (Python's generator-return-value mechanism: drained via `next()` inside `try/except StopIteration as stop`, with `stop.value` holding the result).
2. Forward each text delta as an SSE `text_delta`, accumulating token usage.
3. If the model made no tool calls, the turn is done: record usage, emit `done`, return.
4. Otherwise, for each tool call: emit `tool_call`. Read tools execute immediately (emit `tool_result`); write tools are collected without executing.
5. If any write tool calls were collected, emit `confirm_required` for each, record usage, emit `done{pendingConfirmations}`, and return — write tools always end the stream, they never fall through to another round in the same request.
6. Otherwise, append the assistant message and tool results to the running message list and continue to the next round.

If all 6 rounds pass without the model settling on a final answer, the loop emits an `error` ("Too many tool rounds. Please try a simpler request.") followed by `done`.

**Error handling:** provider-level errors (rate limits, bad key, content filter, overload) are classified by the same `_classify_provider_error` used elsewhere in `llm.py` and surfaced as an `error` SSE. Tool *execution* errors are different — they're caught inside `execute_tool`, turned into a `"Error: ..."` string, and fed back to the model as the tool's result text, so the model can react (e.g. try something else) rather than the stream failing outright.

## Confirmation Flow (Write Tools)

There's no separate confirm endpoint — the frontend calls `POST /api/v1/assist` again with the same shape, adding `toolConfirmations`.

1. Backend pauses a round with `confirm_required` + `done{pendingConfirmations: [ids]}`.
2. The frontend's next request resends the **entire conversation**, including the assistant message that contains the pending tool call(s), plus `toolConfirmations: [{ toolCallId, approved }]`.
3. For each `approved: true`, the backend looks the original arguments back up from that assistant message (`_find_tool_call`), emits `tool_executing`, actually runs the tool, and emits `tool_result`.
4. For `approved: false`, nothing runs — a synthetic "User declined this action." tool result is injected instead (flagged `is_error` for Anthropic) so the model sees the decline and can respond to it.
5. The round loop then resumes normally and streams a fresh reply.

**History order.** Both providers reject a tool call that has no result in the message right after it. So when a resumed stream ends (`done`), the frontend (`utils/buildStreamMessages.ts`) stores the results of the decided tool calls (the approved tool's output, `User declined this action.` for the others) in a `tool` message BEFORE the new assistant message, and the results of the new assistant message's own (read) tool calls after it. If a resumed stream stops without `done` (abort, network error), the decided calls still get a result (`The action did not finish.`), so the next request stays valid. As a safety net, `_repair_tool_result_order` in `assist_service.py` moves every tool result right after the assistant message that holds its call, and drops results without a call. It logs a warning when it repairs something. Several tool rounds in one stream are stored as one assistant message (all calls) followed by one `tool` message (all results); this is valid for both providers.

On the frontend, this is a segment of type `action_card` (see [Confirmation UI](#confirmation-ui-action-cards)). Only one action card can be approved per turn — approving one auto-rejects any other still-pending ones, and starting a new message auto-rejects anything left pending from before.

## Conversation Persistence

**The backend is stateless.** There is no conversation/session table — `AssistRequest.messages` carries the entire history on every call, and `assist_service.py` builds its provider-native message list from that request payload alone. The only thing persisted server-side is token usage (see [Token Usage Tracking](#token-usage-tracking)); the conversation content itself is never stored.

On the frontend, `AssistProvider` is mounted once (in the app layout) and owns a single `useAssist()` instance, so the conversation survives client-side navigation between pages but is lost on a full reload — it isn't written to `localStorage`. Both the floating card and the docked column render the same underlying conversation; they're two chrome layouts around one state, not two separate assistants.

## Frontend Architecture

### Panel UI Modes

The panel has two layouts, tracked in a small persisted Zustand store (`store/use-assist-panel-store.ts`, localStorage key `assist-panel`):

- **Floating** — a draggable, resizable card. On a phone (< `md`) it is a bottom drawer (vaul, 85dvh, one snap point); drag down or tap the backdrop to close. "View changes" closes the drawer first, so the diff drawer is not under it. Dragging is handled by `hooks/use-draggable.ts`, resizing by `hooks/use-resizable.ts`.
- **Docked** — a fixed-width column next to the sidebar, resizable by dragging its left edge, only available at `xl` and above.

Only `mode` and `dockedWidth` are persisted; `isOpen` is not, so the panel always starts closed on page load regardless of how it was left. A header button (`toggleMode`) switches between the two.

### Turn / Segment Data Model

The chat renders as an ordered list of **turns**, each holding an ordered list of **segments** (`types.ts`):

```ts
AssistTurn = { id, role: 'user' | 'assistant', segments: TurnSegment[] }

TurnSegment =
  | { type: 'text'; content; displayContent?; streaming }
  | { type: 'tool_indicator'; name; status: 'running' | 'done' | 'failed' }
  | { type: 'tool_result'; name; output; metadata? }
  | { type: 'action_card'; name; arguments; context?; status: 'pending' | 'approved' | 'rejected' }
  | { type: 'error'; message }
```

A user turn is always a single text segment. An assistant turn accumulates whatever sequence of segments the stream produces — text, then a tool indicator, then its result, then more text, and so on. `AssistTurnRow`/`AssistMessage.tsx` dispatch on `segment.type` to render each one.

### Streaming Reveal Pipeline

This is the mechanism that fixed the original bug this feature was built to solve: text could get visually cut into two separate bubbles when a tool call arrived from the backend before the frontend had finished revealing the text that preceded it, because the tool indicator would render immediately, ahead of a reveal animation still in progress.

The fix is a producer–consumer pipeline with two independent halves:

- **Producer** (`utils/sse-stream.ts` + `hooks/use-assist.ts`): parses raw SSE lines into `(event, data)` pairs as they arrive over the network, as fast as the network delivers them. `use-assist.ts` tracks wire-order bookkeeping (which text segment is currently open, its accumulated content) synchronously and independently of React state, since React state lags behind what's actually been revealed.
- **Consumer** (`hooks/use-stream-queue.ts`): a single FIFO of items, one per stream, that paces what actually appears on screen. `text_delta` events are cheap — they just extend the *target* length of the current text item (`extendTarget`). Boundary events (`tool_call`, `tool_result`, `confirm_required`, `done`) are gated: `enqueue(kind, runFn)` appends them to the same FIFO, and `runFn` (the actual `setTurns` update) only runs once every text item ahead of it has fully caught up to its target. A `requestAnimationFrame` loop drives the reveal, speeding up the further the visible text falls behind the accumulated target, with a hard-flush ceiling so a large backlog snaps to instant instead of crawling.

Net effect: the visual order on screen always matches wire order, and a tool indicator can never interrupt a text bubble that's still mid-reveal. `error` events are the one exception — they bypass the queue via `runImmediately` and appear at once, since there's nothing left to sequence against. `stop()` calls `queue.flush()`, which synchronously drains everything (snapping in-progress text to its full target and running all pending boundary closures) so aborting mid-stream doesn't leave a half-revealed bubble or silently drop a tool result.

### Confirmation UI (Action Cards)

`confirm_required` renders as an `action_card` segment (`ActionCard` in `AssistMessage.tsx`): a tool icon and label, a per-tool argument summary, and a richer preview when the tool supplies a `context`. For `edit_test` this is a before/after preview (title/description as strikethrough-old → new, questions to remove listed by prompt text). The context uses names, not IDs, and only items of the current user. While `status: 'pending'`, it shows Approve/Reject buttons that call back into `useAssist().confirm(toolCallId, approved)` (see [Confirmation Flow](#confirmation-flow-write-tools)).

### Diff Review Flow (`refine_note` / `refine_questions`)

Unlike the action-card tools, these two execute immediately. Their `tool_result` populates a separate, un-persisted Zustand store (`store/use-assist-diff-store.ts`) with the old/new content (note) or the old/new question set (test). The chat message itself just shows a compact "view changes" link — the actual diff (`components/diff/DiffPanel.tsx` plus per-type content components) renders **on the resource's own page**, not inside the chat panel: the note or test editor shows the accept/reject panel whenever the store holds a pending diff for that resource. There is no URL gate, so the link only navigates to the resource, and it is hidden when that page is already open (no remount, so the editor keeps its undo history). On a phone the diff drawer waits until the Assistant drawer is closed (`useAssistCoversPage`), so the two drawers do not stack. Accept in the note editor is one undo step.

`edit_test`'s question-removal side effect gets its own recovery path instead of a diff: a `sonner` toast with an 8-second "Undo" action that calls the bulk-restore endpoint, since a removal is just a soft delete and restoring it is a single call rather than something worth a full diff view.

### Attachments & @ Mentions

Two related systems feed extra context into a message, both wired into the Tiptap-based input (`components/AssistInput.tsx`):

- **Attachments** (`store/use-assist-attachments-store.ts`) — a note-chunk selection or a set of selected test questions, added from *outside* the chat (e.g. selecting text in the note editor), rendered as chips (`AttachmentChip.tsx`). Two slash commands lean on this: `/edit-note` bypasses the normal chat/SSE path entirely, calling a handler the note editor registers via `store/use-assist-command-bridge.ts` (so the edit reuses the editor's own diff/highlight UX instead of going through the Assistant's tool-calling loop); `/edit-test` builds an instruction that names `refine_questions` explicitly and sends it as a normal message.
- **@ Mentions** (`context/page-data-context.tsx`, `hooks/use-provide-page-data.ts`) — pages can register candidates (e.g. one per question on the test editor); typing `@` opens a filtered picker, and picking one inserts an atomic node that expands to its full content when the message is sent, while still displaying to the user as a short `@Label`.

### Page Context

Pages opt in to contributing context via `useProvidePageData(contextData, mentionCandidates?)`, which clears automatically on unmount so context never leaks between pages. `hooks/use-page-context.ts` combines the current pathname, a `resourceType`/`resourceId` pair (matched against known detail-page URL patterns), and that free-text `contextData` into the `pageContext` sent on every request.

The backend only ever uses `pageContext` for one thing: `build_system_prompt` (`assist_prompts.py`) appends it to the system prompt as a "Current page context" section, with an instruction to the model to prefer it over calling a read tool when it already answers the question. No tool reads `pageContext` directly or uses it as an implicit argument.

## System Prompt

`ASSIST_SYSTEM_PROMPT` (`assist_prompts.py`) establishes the Assistant's identity and behavior rules, notably:

- Follow the recipes for "move these notes into a new folder X" (`list_notes`/`list_folders` → `create_folder` → `move_items`) and "check the trash" (`list_trash` → `restore_from_trash`).
- Call write tools immediately rather than asking "should I proceed?" in prose. `edit_test` shows its own approve/reject card, so asking first would double the confirmation step. The Files and Trash tools run at once, and the assistant says what it changed.
- Keep narration between tool calls minimal — the UI already shows spinners and labels for what's running.
- Before referring to "question N" in a test, call `get_test_details` first and match by list position *and* prompt text, since position alone is ambiguous once questions have been reordered or edited.
- Refuse or ask for clarification rather than calling a tool when a request contradicts a question's actual type (e.g. asking to add options to a Simple question).
- Never expose internal IDs or SRS metadata unless the user explicitly asks for them.

`build_system_prompt(page_context)` appends the dynamic page-context section on top of this static prompt.

## Token Usage Tracking

Recorded exactly like the other six AI features (see [Token Usage & Cost Tracking](token-usage.md)), under `AIFeature.ASSIST` (enum value `7`). Usage is accumulated across every round of one HTTP request and recorded once, at whichever terminal event ends the stream (`done`, or the `confirm_required`-triggered `done`, or the max-rounds error) — it's skipped only if a request ended before any model call happened (e.g. an immediate error), in which case there's nothing to bill.

## Known Behavior Notes

- There's no cancel/abort endpoint — the client drops the SSE connection to stop a stream, and there's nothing server-side that reacts specially to the disconnect.
- Because the backend is stateless, every round-trip (including every confirmation) resends the full conversation history. This is simple and correct at normal conversation lengths; a very long-running conversation would pay for that history on every call, which would be worth revisiting if it ever becomes a real cost or latency concern.

## Related Docs

- [AI Features](ai-features.md) — the shared `LLMClient` abstraction, provider setup, and the other six AI features.
- [Study Notes](study-notes.md) — `create_note`/`refine_note` wrap the same generation/refinement logic described there.
- [AI Test Generation](test-generation.md) — `create_test`/`refine_questions`/`edit_test` wrap the same generation/editing logic described there.
