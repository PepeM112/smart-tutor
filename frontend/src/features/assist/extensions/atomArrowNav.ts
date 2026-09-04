import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

// Atom inline nodes (mentions, chips, commands) render as contenteditable="false"
// islands. The browser's native caret movement can stop in an ambiguous
// "selected" state right at their boundary instead of moving straight past
// them, requiring two arrow presses. This intercepts ArrowLeft/ArrowRight next
// to an atom node and jumps the cursor directly across it in one keypress.
export const AtomArrowNav = Extension.create({
  name: 'atomArrowNav',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
            if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;

            const { state } = view;
            const { selection } = state;
            if (!selection.empty) return false;

            const dir = event.key === 'ArrowLeft' ? -1 : 1;
            const $pos = selection.$head;
            const node = dir === -1 ? $pos.nodeBefore : $pos.nodeAfter;
            if (!node || !node.isAtom) return false;

            const targetPos = dir === -1 ? $pos.pos - node.nodeSize : $pos.pos + node.nodeSize;
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, targetPos)).scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
