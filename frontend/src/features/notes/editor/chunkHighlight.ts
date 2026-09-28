// Highlight for the text of an AI chunk edit.
//
// The highlight is a ProseMirror decoration, not a mark: it is not part of the
// document, so it is never saved to the markdown and never enters the undo history.
// The decoration is mapped through each transaction, so it follows the text while
// the user types above it. Deleting all of the text removes the decoration.
//
// States:
//   pending — the AI request runs. A click does nothing.
//   ready   — the result is ready. A click calls `onClick(id)` (opens the diff).
//   active  — the diff of this chunk is open.

import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type ChunkHighlightState = 'pending' | 'ready' | 'active';

type ChunkSpec = { chunkId: string; state: ChunkHighlightState };

type ChunkHighlightMeta =
  | { type: 'add'; id: string; from: number; to: number }
  | { type: 'remove'; id: string }
  | { type: 'setState'; id: string; state: ChunkHighlightState };

export type ChunkHighlightStorage = {
  /** Set by the owner of the diffs. In storage, not options: the extension list is memoized. */
  onClick: ((id: string) => void) | null;
};

declare module '@tiptap/core' {
  interface Storage {
    chunkHighlight: ChunkHighlightStorage;
  }
}

const chunkHighlightKey = new PluginKey<DecorationSet>('chunkHighlight');

export const ChunkHighlight = Extension.create<object, ChunkHighlightStorage>({
  name: 'chunkHighlight',

  addStorage() {
    return { onClick: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin<DecorationSet>({
        key: chunkHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => applyMeta(tr, set.map(tr.mapping, tr.doc)),
        },
        props: {
          decorations: state => chunkHighlightKey.getState(state),
          handleClick: (view, pos) => {
            const hit = findDecorations(view.state).find(
              d => d.from <= pos && pos <= d.to && specOf(d).state !== 'pending'
            );
            if (hit) storage.onClick?.(specOf(hit).chunkId);
            // Not handled: the click still places the cursor.
            return false;
          },
        },
      }),
    ];
  },
});

/** Highlight `[from, to]`. Returns false (and adds nothing) when the range overlaps another chunk. */
export function addChunkHighlight(editor: Editor, id: string, from: number, to: number): boolean {
  const size = editor.state.doc.content.size;
  const start = Math.max(0, Math.min(from, size));
  const end = Math.max(0, Math.min(to, size));
  if (end <= start) return false;
  if (findDecorations(editor.state).some(d => d.from < end && start < d.to)) return false;
  dispatchMeta(editor, { type: 'add', id, from: start, to: end });
  return true;
}

/** Called with the chunk id when the user clicks a highlight that has a result. */
export function setChunkHighlightClickHandler(editor: Editor, onClick: ((id: string) => void) | null): void {
  editor.storage.chunkHighlight.onClick = onClick;
}

export function removeChunkHighlight(editor: Editor, id: string): void {
  dispatchMeta(editor, { type: 'remove', id });
}

export function setChunkHighlightState(editor: Editor, id: string, state: ChunkHighlightState): void {
  dispatchMeta(editor, { type: 'setState', id, state });
}

/** Current (mapped) range of the chunk, or null when its text was deleted. */
export function getChunkRange(editor: Editor, id: string): { from: number; to: number } | null {
  const deco = findDecorations(editor.state).find(d => specOf(d).chunkId === id);
  return deco ? { from: deco.from, to: deco.to } : null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function applyMeta(tr: Transaction, set: DecorationSet): DecorationSet {
  const meta = tr.getMeta(chunkHighlightKey) as ChunkHighlightMeta | undefined;
  if (!meta) return set;
  if (meta.type === 'add') {
    return set.add(tr.doc, [createDecoration(meta.from, meta.to, { chunkId: meta.id, state: 'pending' })]);
  }
  const current = set.find(undefined, undefined, spec => (spec as ChunkSpec).chunkId === meta.id);
  // Decoration attributes are fixed: a state change replaces the decoration.
  // Build the new ones first: `remove` sets the entries of the array it gets to null.
  const replacements =
    meta.type === 'setState'
      ? current.map(d => createDecoration(d.from, d.to, { chunkId: meta.id, state: meta.state }))
      : [];
  return set.remove(current).add(tr.doc, replacements);
}

function createDecoration(from: number, to: number, spec: ChunkSpec): Decoration {
  return Decoration.inline(
    from,
    to,
    { class: 'chunk-highlight', 'data-chunk-id': spec.chunkId, 'data-state': spec.state },
    // Text typed at the edges is not part of the chunk.
    { ...spec, inclusiveStart: false, inclusiveEnd: false }
  );
}

function findDecorations(state: EditorState): Decoration[] {
  return chunkHighlightKey.getState(state)?.find() ?? [];
}

function specOf(deco: Decoration): ChunkSpec {
  // SAFETY: every decoration in this plugin is made by `createDecoration`.
  return deco.spec as ChunkSpec;
}

function dispatchMeta(editor: Editor, meta: ChunkHighlightMeta): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(chunkHighlightKey, meta).setMeta('addToHistory', false));
}
