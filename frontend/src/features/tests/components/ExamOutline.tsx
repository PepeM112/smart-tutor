'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { toPlainPreview } from '@/lib/plainPreview';
import { cn } from '@/lib/utils';

import { type ExamEntry, isEntryAnswered } from '../utils/examProgress';

interface ExamOutlineProps {
  entries: ExamEntry[];
  /** The anchor of the section the reader is on. */
  activeAnchorId: string | null;
  onJump: (anchorId: string) => void;
}

/** The exam in the outline column and in the Contents drawer: the progress and a jump list. */
export function ExamOutline({ entries, activeAnchorId, onJump }: ExamOutlineProps) {
  const t = useTranslations();
  const answered = entries.filter(isEntryAnswered).length;
  const totalPoints = entries.reduce((sum, entry) => sum + entry.points, 0);
  const percent = entries.length === 0 ? 0 : Math.round((answered / entries.length) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {t('exam.answered_count', { answered, total: entries.length })}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('exam.points_total', { points: totalPoints })}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={t('exam.answered_count', { answered, total: entries.length })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 overflow-hidden rounded-full bg-track"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol>
        {entries.map(entry => (
          <li key={entry.anchorId}>
            <button
              type="button"
              data-outline-pick
              aria-current={entry.anchorId === activeAnchorId ? 'location' : undefined}
              onClick={() => onJump(entry.anchorId)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted',
                'aria-[current=location]:bg-muted aria-[current=location]:font-medium'
              )}
            >
              <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{entry.number}</span>
              <span className="min-w-0 flex-1 truncate">{toPlainPreview(entry.title)}</span>
              <EntryState entry={entry} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A check mark with a name, or words. A group shows how many of its questions have an answer. */
function EntryState({ entry }: { entry: ExamEntry }) {
  const t = useTranslations();

  if (entry.isGroup) {
    return (
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {entry.answeredCount}/{entry.totalCount}
      </span>
    );
  }
  if (isEntryAnswered(entry)) {
    return <Check role="img" aria-label={t('exam.answered')} className="size-4 shrink-0 text-feedback-correct" />;
  }
  return <span className="shrink-0 text-xs text-muted-foreground">{t('exam.not_answered')}</span>;
}
