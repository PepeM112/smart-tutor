'use client';

import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';

import { useAssistContext } from '../context/AssistContext';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistDockedColumn } from './AssistDockedColumn';

/**
 * Conditionally renders the docked column inside the layout flex container.
 * Only visible when mode is docked, screen is xl+, and panel is open.
 */
export function AssistDockedWrapper() {
  const aiAvailable = useAiAvailable();
  const { isXl } = useBreakpoint();
  const mode = useAssistPanelStore(s => s.mode);
  const isOpen = useAssistPanelStore(s => s.isOpen);
  const { turns, isStreaming, send, stop, confirm, clear } = useAssistContext();

  if (!aiAvailable || !isXl || mode !== 'docked' || !isOpen) return null;

  return (
    <AssistDockedColumn
      turns={turns}
      isStreaming={isStreaming}
      onSend={send}
      onStop={stop}
      onConfirm={confirm}
      onClear={clear}
    />
  );
}
