'use client';

import { Minus, RotateCw, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { useBreakpoint } from '@/hooks/use-breakpoint';

import { useAssist } from '../hooks/use-assist';
import { useDraggable } from '../hooks/use-draggable';
import { usePageContext } from '../hooks/use-page-context';
import { useResizable } from '../hooks/use-resizable';

import AssistChatBody from './AssistChatBody';
import { AssistInput } from './AssistInput';

const FAB_SIZE = 56;
const DEFAULT_OFFSET = 24;
const MORPH_MS = 380;
const CONTENT_FADE_MS = 120;

export function AssistPanel() {
  const aiAvailable = useAiAvailable();
  const { isMobile } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const pageContext = usePageContext();
  const { messages, isStreaming, send, stop, confirm, clear } = useAssist(pageContext);

  const { size, isResizing, handleResizeStart, resetSize } = useResizable();
  const fab = useDraggable();
  const card = useDraggable(undefined, size);

  const panelRef = useRef<HTMLDivElement>(null);

  const isDragging = fab.isDragging || card.isDragging;

  const resolveElement = (): { x: number; y: number } | null => {
    const el = panelRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };

  const cardFromFab = (fabPos: { x: number; y: number }) => {
    const fabCenterX = fabPos.x + FAB_SIZE / 2;
    const fabCenterY = fabPos.y + FAB_SIZE / 2;
    const pinRight = fabCenterX > window.innerWidth / 2;
    const pinBottom = fabCenterY > window.innerHeight / 2;
    return {
      x: Math.max(0, pinRight ? fabPos.x + FAB_SIZE - size.width : fabPos.x),
      y: Math.max(0, pinBottom ? fabPos.y + FAB_SIZE - size.height : fabPos.y),
    };
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

    const fabPos = fab.position.x !== -1 ? fab.position : resolveElement();
    if (!fabPos) return;

    const needsResolve = fab.position.x === -1;
    if (needsResolve) fab.setPosition(fabPos);

    if (card.position.x === -1) {
      card.setPosition(cardFromFab(fabPos));
    }

    if (needsResolve) {
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    } else {
      setOpen(true);
    }
  };

  const handleMinimize = () => {
    setClosing(true);
    setTimeout(() => {
      const cardPos = card.position.x !== -1 ? card.position : resolveElement();
      if (cardPos) {
        fab.setPosition(fabFromCard(cardPos));
      }
      setOpen(false);
      setClosing(false);
    }, CONTENT_FADE_MS);
  };

  const handleResetPositionAndSize = () => {
    const targetX = window.innerWidth - 460 - DEFAULT_OFFSET;
    const targetY = window.innerHeight - 640 - DEFAULT_OFFSET;
    card.setPosition({ x: targetX, y: targetY });
    resetSize();
    // Wait for the CSS morph transition to finish before clearing explicit positions
    setTimeout(() => {
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
    (e: React.MouseEvent, edge: 'top' | 'left' | 'top-left') => {
      const resolved = resolveCardPosition();
      if (resolved.x === -1) return;
      if (card.position.x === -1) card.setPosition(resolved);
      handleResizeStart(e, edge, resolved, card.setPosition);
    },
    [handleResizeStart, card, resolveCardPosition]
  );

  if (!aiAvailable) return null;

  const composer = (
    <AssistInput
      onSend={send}
      onStop={stop}
      onCommand={cmd => {
        if (cmd === '/clear') clear();
      }}
      isStreaming={isStreaming}
    />
  );

  const headerActions = (variant: 'mobile' | 'desktop') => (
    <div className={`flex items-center ${variant === 'desktop' ? 'gap-0.5' : 'gap-1'}`}>
      <Button
        variant="ghost"
        size={variant === 'desktop' ? 'icon-sm' : 'icon'}
        icon={RotateCw}
        onClick={clear}
        aria-label="Clear chat"
        tooltip="Clear chat"
      />
      <Button
        variant="ghost"
        size={variant === 'desktop' ? 'icon-sm' : 'icon'}
        icon={Minus}
        onClick={variant === 'desktop' ? handleMinimize : () => setOpen(false)}
        aria-label={variant === 'desktop' ? 'Minimize' : 'Close'}
        tooltip={variant === 'desktop' ? 'Minimize' : 'Close'}
      />
    </div>
  );

  if (isMobile) {
    return (
      <>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open AI Assistant"
            className="fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <WandSparkles className="size-6" />
          </button>
        )}

        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40"
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="mobile-panel"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl bg-background shadow-xl"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
                  <div className="flex flex-1 items-center gap-1.5 px-1 py-1">
                    <WandSparkles className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Assistant</span>
                  </div>
                  {headerActions('mobile')}
                </div>

                <AssistChatBody messages={messages} onConfirm={confirm} footer={composer} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  const activePos = open ? card.position : fab.position;
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
      className="fixed z-40 overflow-hidden"
      style={{
        ...(isPositioned ? { left: activePos.x, top: activePos.y } : { right: DEFAULT_OFFSET, bottom: DEFAULT_OFFSET }),
        width: open ? size.width : FAB_SIZE,
        height: open ? size.height : FAB_SIZE,
        borderRadius: open ? 14 : 28,
        transition: cssTransition,
        boxShadow: open
          ? '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)'
          : '0 4px 16px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
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
            <div className="flex shrink-0 items-center justify-between border-b border-border px-1.5 py-1">
              <div
                onMouseDown={card.handleMouseDown}
                onDoubleClick={handleResetPositionAndSize}
                className="flex flex-1 cursor-grab items-center gap-1.5 rounded-md px-2 py-1 active:cursor-grabbing"
              >
                <WandSparkles className="size-3.5 text-muted-foreground" />
                <span className="text-[13px] font-medium text-foreground">Assistant</span>
              </div>
              {headerActions('desktop')}
            </div>

            <AssistChatBody messages={messages} onConfirm={confirm} footer={composer} />

            {/* Resize handles */}
            <div onMouseDown={e => onResizeStart(e, 'top')} className="absolute inset-x-0 top-0 h-1 cursor-n-resize" />
            <div
              onMouseDown={e => onResizeStart(e, 'left')}
              className="absolute inset-y-0 left-0 w-1 cursor-w-resize"
            />
            <div
              onMouseDown={e => onResizeStart(e, 'top-left')}
              className="absolute top-0 left-0 size-3 cursor-nw-resize"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
