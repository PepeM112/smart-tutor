import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { AttachmentChip } from '../components/AttachmentChip';

import type { ChatAttachment } from '../store/useAssistAttachmentsStore';

export function ChipView({ node }: NodeViewProps) {
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
