// ProseMirror behavior of the math nodes that is not a command: Enter on a selected node, and the cleanup of an
// empty node.

import { Plugin, PluginKey } from '@tiptap/pm/state';

import { selectedMath } from './mathCommands';
import { MATH_FOCUS_META } from './mathFocus';

import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// Enter would otherwise replace the selected node with a new line. The popover reads the meta and focuses its field.
function requestMathEdit(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' || event.isComposing || view.composing || !selectedMath(view.state)) return false;
  view.dispatch(view.state.tr.setMeta(MATH_FOCUS_META, true));
  return true;
}

/** A node left empty (the selection moved away) would save as nothing, so it is deleted. */
function deleteEmptyMathLeft(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState
): Transaction | null {
  const previous = selectedMath(oldState);
  if (!previous || previous.latex.trim()) return null;

  const mapped = transactions.reduce<{ pos: number; deleted: boolean }>(
    (acc, tr) => {
      const result = tr.mapping.mapResult(acc.pos, 1);
      return { pos: result.pos, deleted: acc.deleted || result.deleted };
    },
    { pos: previous.pos, deleted: false }
  );
  if (mapped.deleted) return null;

  const node = newState.doc.nodeAt(mapped.pos);
  const isStillSelected = selectedMath(newState)?.pos === mapped.pos;
  if (!node || node.type.name !== previous.kind || node.attrs.latex !== '' || isStillSelected) return null;
  return newState.tr.delete(mapped.pos, mapped.pos + node.nodeSize);
}

export const mathPlugin = (): Plugin =>
  new Plugin({
    key: new PluginKey('noteMath'),
    props: { handleKeyDown: requestMathEdit },
    appendTransaction: deleteEmptyMathLeft,
  });
