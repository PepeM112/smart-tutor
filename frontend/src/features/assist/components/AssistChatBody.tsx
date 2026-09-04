'use client';

import { WandSparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { AssistTurnRow } from './AssistTurnRow';

import type { AssistTurn } from '../types';

type AssistChatBodyProps = {
  turns: AssistTurn[];
  onConfirm: (toolCallId: string, approved: boolean) => void;
  footer: React.ReactNode;
};

export default function AssistChatBody({ turns, onConfirm, footer }: AssistChatBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  return (
    <>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-3">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <WandSparkles className="size-8 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">Ask me anything about your studies.</p>
            <p className="text-xs text-muted-foreground/60">
              I can search your notes, tests, and questions, or create new content for you.
            </p>
          </div>
        )}
        {turns.map(turn => (
          <AssistTurnRow key={turn.id} turn={turn} onConfirm={onConfirm} />
        ))}
      </div>
      {footer}
    </>
  );
}
