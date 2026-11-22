import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { stringAttr } from '@/lib/prosemirrorAttrs';

import { AttachmentChip } from '../components/AttachmentChip';

import type { ChatAttachment } from '../store/useAssistAttachmentsStore';

function toAttachmentType(value: string): ChatAttachment['type'] {
  return value === 'test_questions' ? 'test_questions' : 'note_chunk';
}

export function ChipView({ node }: NodeViewProps) {
  const rawMetadata = stringAttr(node.attrs, 'metadata') || '{}';
  const attachment: ChatAttachment = {
    id: stringAttr(node.attrs, 'id'),
    label: stringAttr(node.attrs, 'label'),
    content: stringAttr(node.attrs, 'content'),
    type: toAttachmentType(stringAttr(node.attrs, 'type')),
    // SAFETY: the attribute holds the JSON that AssistInput wrote from a `ChatAttachment['metadata']`; a guard would only copy that type
    metadata: JSON.parse(rawMetadata) as ChatAttachment['metadata'],
  };

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <AttachmentChip attachment={attachment} />
    </NodeViewWrapper>
  );
}
