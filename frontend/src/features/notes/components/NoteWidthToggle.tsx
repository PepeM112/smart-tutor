'use client';

import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  isFullWidth: boolean;
  onToggle: () => void;
};

/** Switches the note text column between the reading width and the full page width. */
export function NoteWidthToggle({ isFullWidth, onToggle }: Props) {
  const t = useTranslations('notes');
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      // Fixed label: `aria-pressed` already tells the state. A label that changes too
      // makes a screen reader say the state two times.
      aria-pressed={!isFullWidth}
      aria-label={t('width_reading')}
      tooltip={t(isFullWidth ? 'width_reading' : 'width_full')}
      className={cn(!isFullWidth && 'text-primary')}
    >
      <BookOpen className="size-[18px]" />
    </Button>
  );
}
