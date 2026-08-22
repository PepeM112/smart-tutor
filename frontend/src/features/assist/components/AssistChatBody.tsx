'use client';

import { WandSparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { AssistMessageRow } from './AssistMessage';

import type { ChatMessage } from '../types';

type AssistChatBodyProps = {
  messages: ChatMessage[];
  onConfirm: (toolCallId: string, approved: boolean) => void;
  footer: React.ReactNode;
};

export default function AssistChatBody({ messages, onConfirm, footer }: AssistChatBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <WandSparkles className="size-8 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">Ask me anything about your studies.</p>
            <p className="text-xs text-muted-foreground/60">
              I can search your notes, tests, and questions, or create new content for you.
            </p>
          </div>
        )}
        {messages.map(msg => (
          <AssistMessageRow key={msg.id} message={msg} onConfirm={onConfirm} />
        ))}
      </div>
      {footer}
    </>
  );
}
