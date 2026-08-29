'use client';

import { Minus, PanelRight, RotateCw, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';

import { useDraggable } from '../hooks/useDraggable';
import { useResizable } from '../hooks/useResizable';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import AssistChatBody from './AssistChatBody';
import { AssistInput } from './AssistInput';

import type { AssistTurn } from '../types';

const FAB_SIZE = 56;
const DEFAULT_OFFSET = 16;
const FAB_OFFSET = 32;
const MORPH_MS = 380;
const CONTENT_FADE_MS = 120;

type Props = {
  turns: AssistTurn[];
  isStreaming: boolean;
  onSend: (text: string, displayText?: string) => void;
  onStop: () => void;
  onConfirm: (toolCallId: string, approved: boolean) => void;
  onClear: () => void;
};

export function AssistFloatingCard({ turns, isStreaming, onSend, onStop, onConfirm, onClear }: Props) {
  const { isMobile, isXl } = useBreakpoint();
  const [closing, setClosing] = useState(false);

  const isOpen = useAssistPanelStore(s => s.isOpen);
  const storeSetOpen = useAssistPanelStore(s => s.setOpen);
  const mode = useAssistPanelStore(s => s.mode);
  const toggleMode = useAssistPanelStore(s => s.toggleMode);

  const { size, isResizing, handleResizeStart, resetSize } = useResizable();
  const fab = useDraggable();
  const card = useDraggable(undefined, size);

  const panelRef = useRef<HTMLDivElement>(null);
  const minimizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (minimizeTimeoutRef.current) clearTimeout(minimizeTimeoutRef.current);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const isDragging = fab.isDragging || card.isDragging;

  const resolveElement = (): { x: number; y: number } | null => {
    const el = panelRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };

  const fabFromCard = (cardPos: { x: number; y: number }) => {
    const cardCenterX = cardPos.x + size.width / 2;
    const cardCenterY = cardPos.y + size.height / 2;
    const pinRight = cardCenterX > window.innerWidth / 2;
    const pinBottom = cardCenterY > window.innerHeight / 2;
    return {
      x: pinRight ? cardPos.x + size.width - FAB_SIZE : cardPos.x,
      y: pinBottom ? cardPos.y + size.height - FAB_SIZE : cardPos.y,
    };
  };

  const handleOpen = () => {
    if (fab.wasDragged.current) return;

    if (mode === 'docked' && isXl) {
      storeSetOpen(true);
      return;
    }

    const fabPos = fab.position.x !== -1 ? fab.position : resolveElement();
    if (!fabPos) return;

    const needsResolve = fab.position.x === -1;
    if (needsResolve) fab.setPosition(fabPos);

    if (card.position.x === -1) {
      card.setPosition({
        x: window.innerWidth - size.width - DEFAULT_OFFSET,
        y: window.innerHeight - size.height - DEFAULT_OFFSET,
      });
    }

    if (needsResolve) {
      requestAnimationFrame(() => requestAnimationFrame(() => storeSetOpen(true)));
    } else {
      storeSetOpen(true);
    }
  };

  const handleMinimize = () => {
    setClosing(true);
    minimizeTimeoutRef.current = setTimeout(() => {
      if (fab.position.x === -1) {
        const cardPos = card.position.x !== -1 ? card.position : resolveElement();
        if (cardPos) {
          fab.setPosition(fabFromCard(cardPos));
        }
      }
      storeSetOpen(false);
      setClosing(false);
    }, CONTENT_FADE_MS);
  };

  const handleResetPositionAndSize = () => {
    const targetX = window.innerWidth - 460 - DEFAULT_OFFSET;
    const targetY = window.innerHeight - 640 - DEFAULT_OFFSET;
    card.setPosition({ x: targetX, y: targetY });
    resetSize();
    resetTimeoutRef.current = setTimeout(() => {
      card.resetPosition();
      fab.resetPosition();
    }, MORPH_MS + 50);
  };

  const resolveCardPosition = useCallback(() => {
    if (card.position.x !== -1) return card.position;
    const el = panelRef.current;
    if (!el) return card.position;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }, [card.position]);

  const onResizeStart = useCallback(
    (
      e: React.MouseEvent,
      edge: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    ) => {
      const resolved = resolveCardPosition();
      if (resolved.x === -1) return;
      if (card.position.x === -1) card.setPosition(resolved);
      handleResizeStart(e, edge, resolved, card.setPosition);
    },
    [handleResizeStart, card, resolveCardPosition]
  );

  const composer = (
    <AssistInput
      onSend={onSend}
      onStop={onStop}
      onCommand={cmd => {
        if (cmd === '/clear') onClear();
      }}
      isStreaming={isStreaming}
    />
  );

  const headerLeft = (variant: 'mobile' | 'desktop') =>
    variant === 'desktop' && isXl ? (
      <Button
        variant="ghost"
        size="icon"
        icon={PanelRight}
        onClick={toggleMode}
        aria-label="Dock to side"
        tooltip="Dock to side"
      />
    ) : null;

  const headerRight = (variant: 'mobile' | 'desktop') => (
    <div className={`flex items-center ${variant === 'desktop' ? '' : 'gap-1'}`}>
      <Button
        variant="ghost"
        size="icon"
        icon={RotateCw}
        onClick={onClear}
        aria-label="Clear chat"
        tooltip="Clear chat"
      />
      <Button
        variant="ghost"
        size="icon"
        icon={Minus}
        onClick={variant === 'desktop' ? handleMinimize : () => storeSetOpen(false)}
        aria-label={variant === 'desktop' ? 'Minimize' : 'Close'}
        tooltip={variant === 'desktop' ? 'Minimize' : 'Close'}
      />
    </div>
  );

  if (isMobile) {
    return (
      <>
        {!isOpen && (
          <button
            type="button"
            onClick={() => storeSetOpen(true)}
            aria-label="Open AI Assistant"
            className="fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <WandSparkles className="size-6" />
          </button>
        )}

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40"
                onClick={() => storeSetOpen(false)}
              />
              <motion.div
                key="mobile-panel"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-2.5">
                  {headerLeft('mobile')}
                  {headerRight('mobile')}
                </div>

                <AssistChatBody turns={turns} onConfirm={onConfirm} footer={composer} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  const activePos = isOpen ? card.position : fab.position;
  const isPositioned = activePos.x !== -1;
  const cssTransition =
    isDragging || isResizing
      ? 'none'
      : [
          `width ${MORPH_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          `height ${MORPH_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          `border-radius ${MORPH_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          `box-shadow ${MORPH_MS}ms ease`,
          `left ${MORPH_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          `top ${MORPH_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        ].join(', ');

  return (
    <div
      ref={panelRef}
      data-assist-panel
      className={cn('fixed z-40 overflow-hidden', isOpen && 'border border-border')}
      style={{
        ...(isPositioned
          ? { left: activePos.x, top: activePos.y }
          : { right: isOpen ? DEFAULT_OFFSET : FAB_OFFSET, bottom: isOpen ? DEFAULT_OFFSET : FAB_OFFSET }),
        width: isOpen ? size.width : FAB_SIZE,
        height: isOpen ? size.height : FAB_SIZE,
        borderRadius: isOpen ? 14 : 28,
        transition: cssTransition,
        boxShadow: isOpen ? 'var(--assist-panel-shadow-open)' : 'var(--assist-panel-shadow-closed)',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!isOpen ? (
          <motion.div
            key="fab"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 flex items-center justify-center"
            onMouseDown={fab.handleMouseDown}
          >
            <button
              type="button"
              onClick={handleOpen}
              aria-label="Open AI Assistant"
              className="flex size-14 items-center justify-center bg-primary text-primary-foreground transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              <WandSparkles className="size-6" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: closing ? CONTENT_FADE_MS / 1000 : 0.18, delay: closing ? 0 : 0.08 }}
            className="flex h-full flex-col bg-background"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-1.5 py-2">
              <div className="flex flex-1 items-center">
                {headerLeft('desktop')}
                <div
                  onMouseDown={card.handleMouseDown}
                  onDoubleClick={handleResetPositionAndSize}
                  className="flex flex-1 cursor-grab items-center self-stretch rounded-md px-2 active:cursor-grabbing"
                />
              </div>
              {headerRight('desktop')}
            </div>

            <AssistChatBody turns={turns} onConfirm={onConfirm} footer={composer} />

            {/* Resize handles — edges */}
            <div
              onMouseDown={e => onResizeStart(e, 'top')}
              className="absolute inset-x-1.5 top-0 h-1 cursor-n-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'bottom')}
              className="absolute inset-x-1.5 bottom-0 h-1 cursor-s-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'left')}
              className="absolute inset-y-1.5 left-0 w-1 cursor-w-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'right')}
              className="absolute inset-y-1.5 right-0 w-1 cursor-e-resize"
            />
            {/* Resize handles — corners */}
            <div
              onMouseDown={e => onResizeStart(e, 'top-left')}
              className="absolute top-0 left-0 size-2.5 cursor-nw-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'top-right')}
              className="absolute top-0 right-0 size-2.5 cursor-ne-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'bottom-left')}
              className="absolute bottom-0 left-0 size-2.5 cursor-sw-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'bottom-right')}
              className="absolute bottom-0 right-0 size-2.5 cursor-se-resize"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
