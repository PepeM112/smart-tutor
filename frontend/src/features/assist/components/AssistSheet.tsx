'use client';

import { RotateCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { useAssistContext } from '../context/AssistContext';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistChatBody } from './AssistChatBody';
import { AssistInput } from './AssistInput';

type Props = {
  /** `DrawerTitle` on a phone, so the drawer is named by the visible heading. */
  heading?: React.ElementType;
};

/** Content of the Ask AI sheet: header, chat and composer. The caller draws the frame (border, radius). */
export function AssistSheet({ heading: Heading = 'h2' }: Props) {
  const t = useTranslations('assist.panel');
  const setOpen = useAssistPanelStore(s => s.setOpen);
  const { turns, isStreaming, send, stop, confirm, clear } = useAssistContext();

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
    </>
  );
}
