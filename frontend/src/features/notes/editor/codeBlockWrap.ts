// "Wrap lines" of a code block: a view-only setting, never saved.
//
// Why a ProseMirror plugin and not a node attribute or React state:
//   - The toolbar button (`CodeBlockView`) and the block handle menu must show and change the same value.
//     React state of the NodeView is not reachable from the menu.
//   - A node attribute would be part of the document: a toggle would add an undo step, fire `onUpdate`
//     (autosave) and change the JSON, for a setting that is not content.
//   - A plugin state is outside the document. It holds the positions of the wrapped blocks and maps them
//     through every transaction, so a block keeps its setting while text is typed above or inside it.
//     A node decoration puts `data-wrap` on the block, and the CSS does the rest.
// Limit: a block that is moved or replaced (a delete and an insert) goes back to "no wrap".
//
// Why a separate extension and not `addProseMirrorPlugins` of `NoteCodeBlock`: `extensions.ts` calls
// `NoteCodeBlock.extend(...)`. The child copies the parent's `addProseMirrorPlugins`, and its
// `this.parent()` runs the parent's copy too, so the plugin was added two times
// ("Adding different instances of a keyed plugin").

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { EditorState, Transaction } from '@tiptap/pm/state';

const CODE_BLOCK = 'codeBlock';

export const codeWrapKey = new PluginKey<readonly number[]>('noteCodeWrap');

/** Meta of a transaction that flips the wrap of the block at this position. */
type ToggleMeta = { toggle: number };

const uniqueSorted = (positions: readonly number[]): number[] => [...new Set(positions)].sort((a, b) => a - b);

/** The positions after a transaction: mapped through the changes, and only those that are still code blocks. */
export function mapWrapPositions(positions: readonly number[], tr: Transaction): number[] {
  if (!tr.docChanged) return [...positions];
  return positions.flatMap(pos => {
    const result = tr.mapping.mapResult(pos);
    return !result.deleted && tr.doc.nodeAt(result.pos)?.type.name === CODE_BLOCK ? [result.pos] : [];
  });
}

/** Add the position when it is not in the list, remove it when it is. */
export const toggleWrapPosition = (positions: readonly number[], pos: number): number[] =>
  positions.includes(pos) ? positions.filter(p => p !== pos) : uniqueSorted([...positions, pos]);

export const isCodeWrapped = (state: EditorState, pos: number): boolean =>
  codeWrapKey.getState(state)?.includes(pos) ?? false;

/** A transaction with no document change: it is not an undo step and it does not fire the autosave. */
export const buildToggleCodeWrapTransaction = (state: EditorState, pos: number): Transaction | null =>
  state.doc.nodeAt(pos)?.type.name === CODE_BLOCK
    ? state.tr.setMeta(codeWrapKey, { toggle: pos } satisfies ToggleMeta)
    : null;

export const createCodeWrapPlugin = (): Plugin<readonly number[]> =>
  new Plugin<readonly number[]>({
    key: codeWrapKey,
    state: {
      init: () => [],
      apply: (tr, positions) => {
        const mapped = mapWrapPositions(positions, tr);
        const meta = tr.getMeta(codeWrapKey) as ToggleMeta | undefined;
        return meta ? toggleWrapPosition(mapped, meta.toggle) : mapped;
      },
    },
    props: {
      decorations: state => {
        const positions = codeWrapKey.getState(state) ?? [];
        const decorations = positions.flatMap(pos => {
          const node = state.doc.nodeAt(pos);
          return node ? [Decoration.node(pos, pos + node.nodeSize, { 'data-wrap': 'true' })] : [];
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });

/** Add one time to the editor, next to the code block extension. */
export const NoteCodeWrap = Extension.create({
  name: 'noteCodeWrap',
  addProseMirrorPlugins() {
    return [createCodeWrapPlugin()];
  },
});
