'use client';

import { X } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';

import type { ChatAttachment } from '../store/use-assist-attachments-store';

const LABEL_MAX_LENGTH = 30;

type Props = {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
};

export function AttachmentChip({ attachment, onRemove }: Props) {
  const truncatedLabel =
    attachment.label.length > LABEL_MAX_LENGTH ? `${attachment.label.slice(0, LABEL_MAX_LENGTH)}…` : attachment.label;

  return (
    <Tooltip
      side="top"
      content={<div className="max-w-xs whitespace-pre-wrap">{attachment.content.slice(0, 400)}</div>}
    >
      <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <span className="truncate">{truncatedLabel}</span>
        <button
          type="button"
          aria-label="Remove attachment"
          onClick={e => {
            e.stopPropagation();
            onRemove(attachment.id);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </span>
    </Tooltip>
  );
}
