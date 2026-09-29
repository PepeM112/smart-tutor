'use client';

import { posToDOMRect } from '@tiptap/core';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardAnchor, FloatingCardContent } from '@/components/ui/floating-card';

import type { SelectionContext } from '../editor/NoteBubbleMenu';
import type { EditorView } from '@tiptap/pm/view';

/** What Radix positions against. `contextElement` tells it which scroll containers to watch. */
type SelectionAnchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };

type InstructionPopoverProps = {
  selection: SelectionContext;
  /** Read only after mount (by Radix), never during render. */
  getView: () => EditorView | null;
  isPending: boolean;
  onSubmit: (instructions: string) => void;
  onCancel: () => void;
  /** Focus goes back to the editor when the popover closes (there is no trigger button). */
  onClosed: () => void;
};

/** Asks the user for the AI edit instructions, next to the selected text. */
export function InstructionPopover({
  selection,
  getView,
  isPending,
  onSubmit,
  onCancel,
  onClosed,
}: InstructionPopoverProps) {
  const t = useTranslations('notes_ai');
  const [instructions, setInstructions] = useState('');
  const [virtualRef] = useState(() => ({ current: createSelectionAnchor(getView, selection) }));
  // An outside click already put the focus where the user clicked (e.g. the title).
  // A refocus of the editor would then send the typed keys into the body.
  const closedByOutside = useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && instructions.trim()) onSubmit(instructions.trim());
  };

  // Radix handles Esc, outside click, collisions and focus.
  return (
    <FloatingCard open onOpenChange={open => !open && onCancel()}>
      <FloatingCardAnchor virtualRef={virtualRef} />
      <FloatingCardContent
        sideOffset={6}
        collisionPadding={8}
        hideWhenDetached
        // Not while the request runs: the result would then arrive with no visible sign that it was loading.
        onInteractOutside={e => {
          if (isPending) e.preventDefault();
          else closedByOutside.current = true;
        }}
        onEscapeKeyDown={e => isPending && e.preventDefault()}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (!closedByOutside.current) onClosed();
        }}
        className="z-60 flex items-center gap-1.5 p-1.5"
      >
        <input
          type="text"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('instructions_placeholder')}
          className="h-7 w-[min(16rem,calc(100vw-8rem))] rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          disabled={isPending}
        />
        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 text-xs"
          disabled={!instructions.trim() || isPending}
          onClick={() => onSubmit(instructions.trim())}
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : t('edit')}
        </Button>
      </FloatingCardContent>
    </FloatingCard>
  );
}

/**
 * A virtual anchor on the selected text. The rect is read again on every scroll, so the
 * popover follows the selection when the editor column scrolls.
 */
function createSelectionAnchor(getView: () => EditorView | null, selection: SelectionContext): SelectionAnchor {
  return {
    getBoundingClientRect: () => {
      const view = getView();
      if (!view) return selection.rect;
      try {
        return posToDOMRect(view, selection.from, selection.to);
      } catch {
        // The positions are no longer in the document. Keep the last known place.
        return selection.rect;
      }
    },
    get contextElement() {
      return getView()?.dom;
    },
  };
}
