// Commands of the callout block. Like the table commands, they act on a block by its position, not on the
// selection: the block handle menu knows which block it belongs to, and the selection can be anywhere.

import type { CalloutType } from './calloutTypes';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/** Change the type of the callout at `pos`. Gives `null` for a node that is not a callout, or the same type. */
export function buildSetCalloutTypeTransaction(state: EditorState, pos: number, type: CalloutType): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (node?.type.name !== 'callout' || node.attrs.type === type) return null;
  return state.tr.setNodeAttribute(pos, 'type', type);
}
