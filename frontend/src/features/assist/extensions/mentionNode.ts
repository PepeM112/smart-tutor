import { Node, mergeAttributes } from '@tiptap/core';

export const MentionNode = Node.create({
  name: 'assistMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: '' },
      content: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-assist-mention]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-assist-mention': '',
        contenteditable: 'false',
        style: 'color: var(--primary); font-weight: 500; font-size: 13px;',
      }),
      `@${node.attrs.label as string}`,
    ];
  },
});
