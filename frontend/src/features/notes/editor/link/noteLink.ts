// Link mark of the note editor. The link popover (`LinkPopover.tsx`) handles the editing.
// A click opens the link in a new tab when Cmd/Ctrl is held, or when the editor is read-only.
// A plain click in the editor only moves the cursor into the link (the popover then shows).

import Link from '@tiptap/extension-link';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { openLink } from './linkHref';

export const NoteLink = Link.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('noteLinkOpen'),
        props: {
          handleClick: (view, _pos, event) => {
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!anchor || !view.dom.contains(anchor)) return false;
            const wantsOpen = event.metaKey || event.ctrlKey || !view.editable;
            if (!wantsOpen) return false;
            const href = anchor.getAttribute('href');
            if (!href) return false;
            event.preventDefault();
            openLink(href);
            return true;
          },
        },
      }),
    ];
  },
});
