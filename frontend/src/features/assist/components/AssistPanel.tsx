'use client';

import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';

import { useAssistContext } from '../context/AssistContext';
import { useIsAssistHidden } from '../store/useAssistHiddenStore';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistFloatingCard } from './AssistFloatingCard';

/**
 * Renders the floating card / FAB when appropriate.
 * The docked column is rendered in the layout directly, not here.
 */
export function AssistPanel() {
  const aiAvailable = useAiAvailable();
  const { isXl } = useBreakpoint();
  const mode = useAssistPanelStore(s => s.mode);
  const isOpen = useAssistPanelStore(s => s.isOpen);
  const isHidden = useIsAssistHidden();
  const { turns, isStreaming, send, stop, confirm, clear } = useAssistContext();

  // A page can hide the Assistant (a timed course attempt).
  if (!aiAvailable || isHidden) return null;

  // When docked + open at xl+, the column renders in the layout — hide the floating card
  if (mode === 'docked' && isXl && isOpen) return null;

  return (
    <AssistFloatingCard
      turns={turns}
      isStreaming={isStreaming}
      onSend={send}
      onStop={stop}
      onConfirm={confirm}
      onClear={clear}
    />
  );
}
