import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/** Dispatch the transaction of a command. A command that has nothing to do returns `null`. */
export function runEditorCommand(editor: Editor, build: (state: EditorState) => Transaction | null): void {
  if (editor.isDestroyed) return;
  const tr = build(editor.state);
  if (tr) editor.view.dispatch(tr);
}

/** `onMouseDown` for overlay buttons: a press keeps the editor focus and selection. */
export const keepEditorFocus = (event: React.MouseEvent): void => event.preventDefault();
