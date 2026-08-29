import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ChipView } from './ChipView';

export const ChipNode = Node.create({
  name: 'assistChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: '' },
      content: { default: '' },
      type: { default: '' },
      metadata: { default: '{}' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-assist-chip]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-assist-chip': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChipView);
  },
});
