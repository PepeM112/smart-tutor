'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const MESSAGE_INTERVAL_MS = 3000;

type DialogLoadingProps = {
  title: string;
  messages?: string[];
};

export function DialogLoading({ title, messages }: DialogLoadingProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const messageCount = messages?.length ?? 0;

  useEffect(() => {
    if (!messageCount) return;

    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      timeoutRef.current = setTimeout(() => {
        setMessageIndex(prev => (prev + 1) % messageCount);
        setIsTransitioning(false);
      }, 200);
    }, MESSAGE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [messageCount]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="relative">
        <Loader2 className="size-10 animate-spin text-primary" />
        <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {messages?.length && (
          <p
            className={cn(
              'text-sm text-muted-foreground transition-opacity duration-200',
              isTransitioning ? 'opacity-0' : 'opacity-100'
            )}
          >
            {messages[messageIndex]}
          </p>
        )}
      </div>
    </div>
  );
}
