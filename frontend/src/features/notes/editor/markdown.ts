/**
 * Markdown parse/serialize helpers for the rich note editor.
 *
 * All functions require an `Editor` instance so they use the registered
 * Markdown extension's manager — this ensures the same set of extensions
 * (tables, task lists, code blocks, …) are applied consistently, and that
 * the output matches what the editor displays.
 *
 * These helpers are called from non-React contexts (AI chunk-edit service,
 * autosave hook) so they are plain functions, not hooks.
 */

import type { Editor, JSONContent } from '@tiptap/core';
import type { MarkdownManager } from '@tiptap/markdown';

// ─── internal helper ────────────────────────────────────────────────────────

function getManager(editor: Editor): MarkdownManager {
  // SAFETY: Markdown extension is always present — createNoteExtensions includes it.
  return (editor.storage as { markdown: { manager: MarkdownManager } }).markdown.manager;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Serialize the full document of `editor` to a GFM markdown string.
 * Equivalent to `editor.commands.getMarkdown()` but returns the string
 * directly without side-effects.
 */
export function serializeMarkdown(editor: Editor): string {
  return getManager(editor).serialize(editor.getJSON());
}

/**
 * Parse `markdown` to a Tiptap `JSONContent` doc using `editor`'s
 * registered Markdown manager.  The result can be passed to
 * `editor.commands.setContent(result)`.
 */
export function parseMarkdown(editor: Editor, markdown: string): JSONContent {
  return getManager(editor).parse(markdown);
}

/**
 * Serialize the current ProseMirror selection (from–to range) to markdown.
 * Returns an empty string when the selection is collapsed.
 *
 * Used by the AI chunk-edit flow: `POST /notes/{id}/edit-chunk` sends this
 * markdown as the "selected content" to grade/rewrite.
 */
export function selectionToMarkdown(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) return '';

  const manager = getManager(editor);
  // Extract the selected fragment and wrap it in a doc-level JSON envelope
  // so MarkdownManager.serialize receives a valid document structure.
  const fragmentJson = editor.state.doc.slice(from, to).content.toJSON() as JSONContent[] | null;
  const docJson: JSONContent = { type: 'doc', content: fragmentJson ?? [] };
  return manager.serialize(docJson);
}

/**
 * Replace the range `[from, to]` in `editor` with the result of parsing
 * `markdown`.  This is the "accept AI edit" operation: the AI returns a
 * revised markdown string and we splice it back into the document at the
 * original selection range.
 *
 * Returns `true` when the command chain ran successfully.
 */
export function replaceSelectionWithMarkdown(editor: Editor, from: number, to: number, markdown: string): boolean {
  const manager = getManager(editor);
  const parsed = manager.parse(markdown);
  // parsed is { type: 'doc', content: [...] } — we insert the content nodes,
  // not the doc wrapper itself.
  const nodes = parsed.content ?? [];
  return editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, nodes).run();
}
