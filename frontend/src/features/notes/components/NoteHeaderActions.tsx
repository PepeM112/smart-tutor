'use client';

import { AlertCircle, FolderInput, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { type AutosaveStatus } from '../editor/useAutosave';

import { NoteWidthToggle } from './NoteWidthToggle';

type NoteHeaderActionsProps = {
  status: AutosaveStatus;
  onRetry: () => void;
  onMove: () => void;
  /** Only desktop has room for a full-width column, so only desktop shows the toggle. */
  showWidthToggle: boolean;
  isFullWidth: boolean;
  onToggleWidth: () => void;
};

/** Right side of the top bar of an editable note: save status, move, width toggle. */
export function NoteHeaderActions({
  status,
  onRetry,
  onMove,
  showWidthToggle,
  isFullWidth,
  onToggleWidth,
}: NoteHeaderActionsProps) {
  const t = useTranslations();

  return (
    <>
      <SaveStatus status={status} onRetry={onRetry} />
      <Button variant="ghost" size="icon" onClick={onMove} tooltip={t('files.move')} aria-label={t('files.move')}>
        <FolderInput className="size-[18px]" />
      </Button>
      {showWidthToggle && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={onToggleWidth} />}
    </>
  );
}

function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  const t = useTranslations('notes');

  if (status === 'saved') return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {status === 'saving' && (
        <>
          <Loader2 className="size-3 animate-spin" />
          <span>{t('saving')}</span>
        </>
      )}
      {status === 'dirty' && <span>{t('saving')}</span>}
      {status === 'error' && (
        <>
          <AlertCircle className="size-3 text-destructive" />
          <span className="text-destructive">{t('failed_to_save')}</span>
          <button type="button" onClick={onRetry} className="text-primary underline hover:no-underline">
            {t('retry')}
          </button>
        </>
      )}
      {/* No Retry button: the same payload gets the same 422. The next edit saves again. */}
      {status === 'invalid' && (
        <>
          <AlertCircle className="size-3 text-destructive" />
          <span className="text-destructive">{t('note_too_long')}</span>
        </>
      )}
    </div>
  );
}
