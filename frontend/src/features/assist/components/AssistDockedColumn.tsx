'use client';

import { PanelRightOpen, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';

import { MAX_DOCKED_WIDTH, MIN_DOCKED_WIDTH, useAssistPanelStore } from '../store/useAssistPanelStore';

import AssistChatBody from './AssistChatBody';
import { AssistInput } from './AssistInput';

import type { AssistTurn } from '../types';

type Props = {
  turns: AssistTurn[];
  isStreaming: boolean;
  onSend: (text: string, displayText?: string) => void;
  onStop: () => void;
  onConfirm: (toolCallId: string, approved: boolean) => void;
  onClear: () => void;
};

export function AssistDockedColumn({ turns, isStreaming, onSend, onStop, onConfirm, onClear }: Props) {
  const toggleMode = useAssistPanelStore(s => s.toggleMode);
  const setOpen = useAssistPanelStore(s => s.setOpen);
  const dockedWidth = useAssistPanelStore(s => s.dockedWidth);
  const setDockedWidth = useAssistPanelStore(s => s.setDockedWidth);

  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const handleMouseMoveRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<(() => void) | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = dockedWidth;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const dx = startXRef.current - ev.clientX;
        const newWidth = Math.max(MIN_DOCKED_WIDTH, Math.min(MAX_DOCKED_WIDTH, startWidthRef.current + dx));
        setDockedWidth(newWidth);
      };

      const handleMouseUp = () => {
        resizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        handleMouseMoveRef.current = null;
        handleMouseUpRef.current = null;
      };

      handleMouseMoveRef.current = handleMouseMove;
      handleMouseUpRef.current = handleMouseUp;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [dockedWidth, setDockedWidth]
  );

  useEffect(() => {
    return () => {
      resizingRef.current = false;
      if (handleMouseMoveRef.current) document.removeEventListener('mousemove', handleMouseMoveRef.current);
      if (handleMouseUpRef.current) document.removeEventListener('mouseup', handleMouseUpRef.current);
    };
  }, []);

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
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-ew-resize hover:bg-primary/20 transition-colors"
      />

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-1">
        <Button
          variant="ghost"
          size="icon-lg"
          icon={PanelRightOpen}
          onClick={toggleMode}
          aria-label="Undock"
          tooltip="Undock to floating"
        />
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-lg"
            icon={RotateCw}
            onClick={onClear}
            aria-label="Clear chat"
            tooltip="Clear chat"
          />
          <Button variant="ghost" size="icon-lg" icon={X} onClick={handleClose} aria-label="Close" tooltip="Close" />
        </div>
      </div>

      {/* Chat body */}
      <AssistChatBody turns={turns} onConfirm={onConfirm} footer={composer} />
    </div>
  );
}
