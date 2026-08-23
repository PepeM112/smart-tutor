import { Node, mergeAttributes } from '@tiptap/core';

export const CommandNode = Node.create({
  name: 'assistCommand',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      command: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-assist-command]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-assist-command': '',
        contenteditable: 'false',
        style:
          'font-weight: 500; color: var(--primary); font-size: 13px; margin-right: 0.375rem;',
      }),
      node.attrs.command as string,
    ];
  },
});
