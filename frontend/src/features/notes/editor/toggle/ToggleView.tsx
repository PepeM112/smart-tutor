'use client';

// React NodeView for toggles: a chevron button, then the summary and the content.
// Open or closed is local state (view-only, never saved). A toggle opens when the cursor enters its
// content (Enter in the title, or an edit from the AI), and stays open until the chevron is used.
// Hiding is CSS only (`.note-toggle[data-open='false']` in `note-editor.css`).

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export function ToggleView({ node, editor, getPos }: NodeViewProps) {
  const t = useTranslations('notes');
  const [open, setOpen] = useState(false);

  // Open when the selection is in the content (after the summary). `pos + node.nodeSize` is already after the toggle.
  useEffect(() => {
    const openIfCursorInContent = (): void => {
      const pos = getPos();
      const summary = node.firstChild;
      if (typeof pos !== 'number' || !summary) return;
      const contentStart = pos + 1 + summary.nodeSize;
      const { from } = editor.state.selection;
      if (from >= contentStart && from < pos + node.nodeSize) setOpen(true);
    };
    editor.on('selectionUpdate', openIfCursorInContent);
    return () => {
      editor.off('selectionUpdate', openIfCursorInContent);
    };
  }, [editor, getPos, node]);

  return (
    <NodeViewWrapper data-slot="note-toggle" data-open={open} className="note-toggle">
      <button
        type="button"
        contentEditable={false}
        aria-expanded={open}
        aria-label={open ? t('toggle_collapse') : t('toggle_expand')}
        // Keep the editor selection: the click must not move the cursor.
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className="note-toggle-chevron"
      >
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
      </button>
      <NodeViewContent className="note-toggle-body" />
    </NodeViewWrapper>
  );
}
