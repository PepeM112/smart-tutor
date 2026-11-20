'use client';

import { useAssistActions, useAssistState } from '../context/AssistContext';

import { AssistChatBody } from './AssistChatBody';
import { AssistInput } from './AssistInput';

/**
 * Chat and composer of the Ask AI sheet. It is its own module so `AssistSheet` can load it on the first
 * open: the composer pulls in Tiptap and the chat pulls in the markdown renderer.
 */
export function AssistSheetBody() {
  const { turns, isStreaming } = useAssistState();
  const { send, stop, confirm, clear } = useAssistActions();

  return (
    <AssistChatBody
      turns={turns}
      onConfirm={confirm}
      isStreaming={isStreaming}
      footer={
        <AssistInput
          onSend={send}
          onStop={stop}
          onCommand={cmd => {
            if (cmd === '/clear') clear();
          }}
          isStreaming={isStreaming}
        />
      }
    />
  );
}
