'use client';

import { Minus, RotateCw, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAiAvailable } from '@/hooks/use-ai-available';

import { useAssist } from '../hooks/use-assist';
import { useDraggable } from '../hooks/use-draggable';
import { usePageContext } from '../hooks/use-page-context';
import { useResizable } from '../hooks/use-resizable';

import { AssistInput } from './AssistInput';
import { AssistMessageRow } from './AssistMessage';

const FAB_SIZE = 56;
const DEFAULT_OFFSET = 24;
const MORPH_MS = 380;
const CONTENT_FADE_MS = 120;

export function AssistPanel() {
  const aiAvailable = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const pageContext = usePageContext();
  const { messages, isStreaming, send, confirm, clear } = useAssist(pageContext);

  const fab = useDraggable();
  const card = useDraggable();
  const { size, isResizing, handleResizeStart, resetSize } = useResizable();

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDragging = fab.isDragging || card.isDragging;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const resolveElement = (): { x: number; y: number } | null => {
    const el = panelRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };

  const handleOpen = () => {
    if (fab.wasDragged.current) return;

    if (fab.position.x === -1) {
      const resolved = resolveElement();
      if (resolved) fab.setPosition(resolved);
    }

    if (card.position.x === -1) {
      const fabPos = fab.position.x !== -1 ? fab.position : resolveElement();
      if (fabPos) {
        card.setPosition({
          x: Math.max(0, fabPos.x + FAB_SIZE - size.width),
          y: Math.max(0, fabPos.y + FAB_SIZE - size.height),
        });
      }
    }
    setOpen(true);
  };

  const handleMinimize = () => {
    setClosing(true);
    setTimeout(() => {
      if (card.position.x !== -1 && fab.position.x === -1) {
        fab.setPosition({
          x: card.position.x + size.width - FAB_SIZE,
          y: card.position.y + size.height - FAB_SIZE,
        });
      }
      setOpen(false);
      setClosing(false);
    }, CONTENT_FADE_MS);
  };

  const handleClearChat = () => {
    clear();
  };

  const handleResetPositionAndSize = () => {
    const targetX = window.innerWidth - 460 - DEFAULT_OFFSET;
    const targetY = window.innerHeight - 640 - DEFAULT_OFFSET;
    card.setPosition({ x: targetX, y: targetY });
    resetSize();
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
        ...(isPositioned
          ? { left: activePos.x, top: activePos.y }
          : { right: DEFAULT_OFFSET, bottom: DEFAULT_OFFSET }),
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
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-1.5 py-1">
              <div
                onMouseDown={card.handleMouseDown}
                onDoubleClick={handleResetPositionAndSize}
                className="flex flex-1 cursor-grab items-center gap-1.5 rounded-md px-2 py-1 active:cursor-grabbing"
              >
                <WandSparkles className="size-3.5 text-muted-foreground" />
                <span className="text-[13px] font-medium text-foreground">Assistant</span>
              </div>

              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon={RotateCw}
                  onClick={handleClearChat}
                  aria-label="Clear chat"
                  tooltip="Clear chat"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon={Minus}
                  onClick={handleMinimize}
                  aria-label="Minimize"
                  tooltip="Minimize"
                />
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <WandSparkles className="size-8 text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground">Ask me anything about your studies.</p>
                  <p className="text-xs text-muted-foreground/60">
                    I can search your notes, tests, and questions, or create new content for you.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <AssistMessageRow key={i} message={msg} onConfirm={confirm} />
              ))}
            </div>

            {/* Composer */}
            <AssistInput
              onSend={send}
              onCommand={cmd => {
                if (cmd === '/clear') clear();
              }}
              isStreaming={isStreaming}
            />

            {/* Resize handles */}
            <div
              onMouseDown={e => onResizeStart(e, 'top')}
              className="absolute inset-x-0 top-0 h-1 cursor-n-resize"
            />
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
