'use client';

import { X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ChatAttachment } from '../store/use-assist-attachments-store';

const LABEL_MAX_LENGTH = 30;

type Props = {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
};

type PreviewPosition = {
  x: number;
  top?: number;
  bottom?: number;
};

export function AttachmentChip({ attachment, onRemove }: Props) {
  const [preview, setPreview] = useState<PreviewPosition | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  const truncatedLabel =
    attachment.label.length > LABEL_MAX_LENGTH ? `${attachment.label.slice(0, LABEL_MAX_LENGTH)}…` : attachment.label;

  const hasPreview = attachment.type !== 'test_questions' && attachment.content.length > 0;

  const openPreview = useCallback(() => {
    if (!hasPreview || !chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const previewHeight = 120;
    const fitsAbove = rect.top - 6 - previewHeight >= 12;
    setPreview({
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 260)),
      ...(fitsAbove ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, [hasPreview]);

  const closePreview = useCallback(() => setPreview(null), []);

  return (
    <>
      <span
        ref={chipRef}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
        className="mb-0.5 mr-2 inline-flex h-5.5 max-w-[220px] items-center gap-1 rounded-sm bg-card px-2 text-xs ring-1 ring-foreground/10 transition-colors hover:bg-muted"
      >
        <span className="truncate">{truncatedLabel}</span>
      </span>
      {preview &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-50 w-60 overflow-hidden rounded-lg bg-card shadow-md ring-1 ring-foreground/10"
            style={{
              left: preview.x,
              top: preview.top,
              bottom: preview.bottom,
            }}
            onMouseEnter={openPreview}
            onMouseLeave={closePreview}
          >
            <div className="max-h-32 overflow-y-auto px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {attachment.content.slice(0, 400)}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
