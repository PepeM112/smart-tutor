'use client';

import { RotateCw, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { useAssistActions } from '../context/AssistContext';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { loadAssistSheetBody } from './loadAssistSheetBody';

// Loads on the first open (or earlier, when the toggle is hovered), not with the page. The skeleton
// fills the sheet under the header, so the sheet opens at once and its layout does not jump.
const AssistSheetBody = dynamic(() => loadAssistSheetBody().then(m => m.AssistSheetBody), {
  ssr: false,
  loading: () => <AssistSheetSkeleton />,
});

interface AssistSheetProps {
  /** `DrawerTitle` on a phone, so the drawer is named by the visible heading. */
  heading?: React.ElementType;
}

/** Content of the Ask AI sheet: header, chat and composer. The caller draws the frame (border, radius). */
export function AssistSheet({ heading: Heading = 'h2' }: AssistSheetProps) {
  const t = useTranslations('assist.panel');
  const setOpen = useAssistPanelStore(s => s.setOpen);
  const { clear } = useAssistActions();

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline pr-3 pl-5">
        <Heading className="flex-1 truncate font-serif text-[19px] font-medium">{t('title')}</Heading>
        <Button
          variant="ghost"
          size="icon"
          icon={RotateCw}
          onClick={clear}
          aria-label={t('clear_chat')}
          tooltip={t('clear_chat')}
        />
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          onClick={() => setOpen(false)}
          aria-label={t('close')}
          tooltip={t('close')}
        />
      </header>
      <AssistSheetBody />
    </>
  );
}

function AssistSheetSkeleton() {
  return (
    <>
      <div className="min-h-0 flex-1" />
      <div aria-hidden className="m-3 h-24 shrink-0 animate-pulse rounded-xl bg-muted" />
    </>
  );
}
