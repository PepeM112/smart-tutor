import { Node, mergeAttributes } from '@tiptap/core';
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import { AttachmentChip } from '../components/AttachmentChip';

import type { ChatAttachment } from '../store/use-assist-attachments-store';

function ChipView({ node }: NodeViewProps) {
  const rawMetadata: string = (node.attrs.metadata as string) || '{}';
  const attachment: ChatAttachment = {
    id: node.attrs.id as string,
    label: node.attrs.label as string,
    content: node.attrs.content as string,
    type: node.attrs.type as ChatAttachment['type'],
    metadata: JSON.parse(rawMetadata) as ChatAttachment['metadata'],
  };

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <AttachmentChip attachment={attachment} />
    </NodeViewWrapper>
  );
}

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
