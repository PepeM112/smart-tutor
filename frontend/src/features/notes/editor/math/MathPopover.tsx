'use client';

/**
 * Popover of the selected math node (editable editor only). A click on a formula, or the arrow keys, select it:
 *
 *   [ x^2 + 1 … ]  Done · Remove
 *
 * - The formula in the editor updates while you type. Nothing else is saved in the document.
 * - Enter (Cmd/Ctrl+Enter in a math block) or Esc close the popover and put the cursor after the formula.
 *   An empty formula is deleted when it closes.
 * - The input takes the focus after a click or after the slash command. The arrow keys only select the node,
 *   so moving through a line does not trap the cursor. Enter on the selected node starts the edit.
 *
 * Like `LinkPopover`, it is an overlay in the editor container.
 */

import { Check, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { PopoverButton } from '../link/LinkPopover';

import {
  buildLeaveMathTransaction,
  buildRemoveMathTransaction,
  buildUpdateLatexTransaction,
  selectedMath,
  type MathTarget,
} from './mathCommands';
import { MATH_FOCUS_META } from './mathFocus';

import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

const POPOVER_GAP = 6; // px between the formula and the popover

type MathAnchor = MathTarget & {
  /** Rect of the formula relative to the container (px). */
  left: number;
  bottom: number;
};

type MathPopoverProps = {
  editor: Editor;
  /** The element the editor is rendered in. The overlay is positioned relative to it. */
  containerRef: RefObject<HTMLElement | null>;
};

export function MathPopover({ editor, containerRef }: MathPopoverProps) {
  const t = useTranslations('notes');
  const [anchor, setAnchor] = useState<MathAnchor | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const shouldFocusField = useRef(false);
  // The transaction handler reads the anchor of the last render, so it needs no re-subscribe on each change.
  const anchorRef = useRef<MathAnchor | null>(null);
  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  const focusField = () => popoverRef.current?.querySelector<HTMLElement>('input, textarea')?.focus();

  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      const next = measureAnchor(editor, containerRef.current);
      if (next && (anchorRef.current?.pos !== next.pos || anchorRef.current?.kind !== next.kind)) {
        // A mouse selection ("pointer") or the slash command asks for the edit. The arrow keys do not.
        shouldFocusField.current = Boolean(transaction.getMeta('pointer') || transaction.getMeta(MATH_FOCUS_META));
      }
      setAnchor(previous => (sameAnchor(previous, next) ? previous : next));
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  }, [editor, containerRef]);

  // Enter on the selected node starts the edit.
  useEffect(() => {
    const dom = editor.view.dom;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || !selectedMath(editor.state)) return;
      event.preventDefault();
      focusField();
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const pos = anchor?.pos;
  const kind = anchor?.kind;
  useEffect(() => {
    if (pos === undefined || !shouldFocusField.current) return;
    shouldFocusField.current = false;
    focusField();
  }, [pos, kind]);

  if (!anchor) return null;

  const dispatch = (tr: Transaction | null) => {
    if (tr) editor.view.dispatch(tr);
  };

  const handleChange = (latex: string) => dispatch(buildUpdateLatexTransaction(editor.state, anchor.pos, latex));

  const handleRemove = () => {
    dispatch(buildRemoveMathTransaction(editor.state, anchor.pos));
    editor.view.focus();
  };

  const handleDone = () => {
    if (!anchor.latex.trim()) {
      handleRemove();
      return;
    }
    dispatch(buildLeaveMathTransaction(editor.state, anchor.pos));
    editor.view.focus();
  };

  const isBlock = anchor.kind === 'blockMath';

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleDone();
      return;
    }
    // A math block has many lines, so Enter adds a line there.
    const isDone = event.key === 'Enter' && (!isBlock || event.metaKey || event.ctrlKey);
    if (!isDone) return;
    event.preventDefault();
    handleDone();
  };

  const fieldClass =
    'min-w-0 flex-1 rounded border border-border bg-background px-2 font-mono text-xs outline-none focus:border-primary';
  const width = isBlock ? '26rem' : '20rem';

  return (
    <div data-slot="math-popover-layer" className="pointer-events-none absolute inset-0 z-30" contentEditable={false}>
      <div
        ref={popoverRef}
        data-slot="math-popover"
        role="group"
        aria-label={t('math_popover_label')}
        // Keep the node selected while a button is pressed (the field still takes the focus).
        onMouseDown={event => {
          if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
            event.preventDefault();
          }
        }}
        style={{
          top: anchor.bottom + POPOVER_GAP,
          // Left edge of the formula, kept inside the editor: at 375px the popover is as wide as the editor.
          left: `max(0px, min(${anchor.left}px, calc(100% - ${width})))`,
          width: `min(${width}, 100%)`,
        }}
        className="pointer-events-auto absolute flex items-start gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
      >
        {isBlock ? (
          <textarea
            rows={3}
            value={anchor.latex}
            onChange={event => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={t('math_latex_label')}
            spellCheck={false}
            className={`${fieldClass} resize-y py-1.5`}
          />
        ) : (
          <input
            type="text"
            value={anchor.latex}
            onChange={event => handleChange(event.target.value.replace(/\s*\n\s*/g, ' '))}
            onKeyDown={handleKeyDown}
            aria-label={t('math_latex_label')}
            spellCheck={false}
            className={`${fieldClass} h-7`}
          />
        )}
        <PopoverButton label={t('math_done')} onClick={handleDone}>
          <Check className="size-3.5" />
        </PopoverButton>
        <PopoverButton label={t('math_remove')} onClick={handleRemove}>
          <Trash2 className="size-3.5" />
        </PopoverButton>
      </div>
    </div>
  );
}

function measureAnchor(editor: Editor, container: HTMLElement | null): MathAnchor | null {
  if (!container || editor.isDestroyed || !editor.isEditable) return null;
  const target = selectedMath(editor.state);
  if (!target) return null;
  const dom = editor.view.nodeDOM(target.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const rect = dom.getBoundingClientRect();
  const origin = container.getBoundingClientRect();
  return { ...target, left: rect.left - origin.left, bottom: rect.bottom - origin.top };
}

const sameAnchor = (a: MathAnchor | null, b: MathAnchor | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pos === b.pos &&
    a.kind === b.kind &&
    a.latex === b.latex &&
    a.left === b.left &&
    a.bottom === b.bottom);
