'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { cn } from '@/lib/utils';

import { useIsAssistHidden } from '../store/useAssistHiddenStore';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { loadAssistSheetBody } from './loadAssistSheetBody';

// A failed chunk load is not an error here: the sheet loads again, with its own loading state, when it opens.
const preloadSheetBody = (): void => void loadAssistSheetBody().catch(() => undefined);

/** Page header button that opens and closes the Ask AI sheet. It is the only entry point. */
export function AssistToggle() {
  const t = useTranslations('assist.panel');
  const aiAvailable = useAiAvailable();
  const isHidden = useIsAssistHidden();
  const isOpen = useAssistPanelStore(s => s.isOpen);
  const toggle = useAssistPanelStore(s => s.toggle);

  // A page can hide the Assistant (a timed course attempt).
  if (!aiAvailable || isHidden) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      icon={Sparkles}
      onClick={toggle}
      onPointerEnter={preloadSheetBody}
      onPointerDown={preloadSheetBody}
      onFocus={preloadSheetBody}
      aria-pressed={isOpen}
      aria-label={t('title')}
      tooltip={t('title')}
      className={cn(isOpen ? 'bg-muted text-primary' : 'text-muted-foreground')}
    />
  );
}
