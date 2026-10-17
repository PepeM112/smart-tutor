'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { copyText } from '@/lib/copyText';
import { cn } from '@/lib/utils';

type Props = {
  /** The text that shows in the chip and goes to the clipboard. */
  text: string;
  /**
   * Describes the action, e.g. "Copy code". The accessible name is this label + the visible text
   * (WCAG 2.5.3: the name must contain the visible label). Default label: the common "Copy".
   */
  label?: string;
  className?: string;
};

/** A chip with a value and a copy icon (for example a join code). A click copies the value. */
export function CopyChip({ text, label, className }: Props) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  // The check icon shows for a moment after a copy (the same as the code block toolbar).
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void copyText(text, { copied: t('copied'), failed: t('failed_to_copy') }).then(ok => {
      if (ok) setCopied(true);
    });
  };

  return (
    <button
      type="button"
      data-slot="copy-chip"
      aria-label={`${label ?? t('copy')} ${text}`}
      onClick={copy}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-2.5 font-mono text-sm',
        'transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      <span className="truncate">{text}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
