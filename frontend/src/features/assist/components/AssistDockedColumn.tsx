'use client';

import { PanelRightOpen, RotateCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { usePointerDrag } from '@/hooks/usePointerDrag';

import { MAX_DOCKED_WIDTH, MIN_DOCKED_WIDTH, useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistChatBody } from './AssistChatBody';
import { AssistInput } from './AssistInput';

import type { AssistTurn, ConfirmHandler } from '../types';

type Props = {
  turns: AssistTurn[];
  isStreaming: boolean;
  onSend: (text: string, displayText?: string) => void;
  onStop: () => void;
  onConfirm: ConfirmHandler;
  onClear: () => void;
};

export function AssistDockedColumn({ turns, isStreaming, onSend, onStop, onConfirm, onClear }: Props) {
  const t = useTranslations('assist.panel');
  const toggleMode = useAssistPanelStore(s => s.toggleMode);
  const setOpen = useAssistPanelStore(s => s.setOpen);
  const dockedWidth = useAssistPanelStore(s => s.dockedWidth);
  const setDockedWidth = useAssistPanelStore(s => s.setDockedWidth);

  const startRef = useRef({ x: 0, width: 0 });

  // The column is on the right, so dragging left makes it wider.
  const { startDrag: handleResizeStart } = usePointerDrag({
    cursor: 'ew-resize',
    onMove: ev => {
      const dx = startRef.current.x - ev.clientX;
      setDockedWidth(Math.max(MIN_DOCKED_WIDTH, Math.min(MAX_DOCKED_WIDTH, startRef.current.width + dx)));
    },
  });

  const handlePointerDown = (e: React.PointerEvent): void => {
    startRef.current = { x: e.clientX, width: dockedWidth };
    handleResizeStart(e);
  };

  const handleClose = () => {
    setOpen(false);
  };

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

  return (
    <div className="relative flex h-full flex-col border-l border-border bg-sidebar" style={{ width: dockedWidth }}>
      {/* Resize handle on left edge */}
      <div
        onPointerDown={handlePointerDown}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-ew-resize touch-none hover:bg-primary/20 transition-colors"
      />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-1">
        <Button
          variant="ghost"
          size="icon-lg"
          icon={PanelRightOpen}
          onClick={toggleMode}
          aria-label={t('undock')}
          tooltip={t('undock_floating')}
        />
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-lg"
            icon={RotateCw}
            onClick={onClear}
            aria-label={t('clear_chat')}
            tooltip={t('clear_chat')}
          />
          <Button
            variant="ghost"
            size="icon-lg"
            icon={X}
            onClick={handleClose}
            aria-label={t('close')}
            tooltip={t('close')}
          />
        </div>
      </div>

      {/* Chat body */}
      <AssistChatBody turns={turns} onConfirm={onConfirm} isStreaming={isStreaming} footer={composer} />
    </div>
  );
}
