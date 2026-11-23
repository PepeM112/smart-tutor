'use client';

import { Info } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { AnswerStatus, type TestResultRead } from '@/client';
import { Tooltip } from '@/components/ui/tooltip';
import { useDateTimePrefs } from '@/hooks/useDateTimePrefs';
import { formatDate } from '@/lib/datetime';
import { toPlainPreview } from '@/lib/plainPreview';
import { cn } from '@/lib/utils';

import { formatPoints, summarizeEntries, type ResultEntry } from '../utils/resultEntries';

import { ResultMark } from './ResultMark';

const SUMMARY_KEYS: Record<AnswerStatus, string> = {
  [AnswerStatus.CORRECT]: 'history.summary_correct',
  [AnswerStatus.PARTIAL]: 'history.summary_partial',
  [AnswerStatus.WRONG]: 'history.summary_wrong',
  [AnswerStatus.PENDING]: 'history.summary_pending',
  [AnswerStatus.FAILED]: 'history.summary_wrong',
};

interface ResultOutlineProps {
  result: TestResultRead;
  testTitle: string;
  entries: ResultEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** The result in the outline column and in the Contents drawer: the score and the list of questions. */
export function ResultOutline({ result, testTitle, entries, selectedId, onSelect }: ResultOutlineProps) {
  return (
    <div className="flex flex-col gap-4">
      <ScoreBlock result={result} testTitle={testTitle} entries={entries} />
      <ol>
        {entries.map(entry => (
          <li key={entry.id}>
            <EntryRow entry={entry} isSelected={entry.id === selectedId} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScoreBlock({ result, testTitle, entries }: Pick<ResultOutlineProps, 'result' | 'testTitle' | 'entries'>) {
  const t = useTranslations();
  const format = useFormatter();
  const prefs = useDateTimePrefs();
  const summary = summarizeEntries(entries);
  const hasPoints = result.totalPoints != null && result.totalPoints > 0;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{testTitle}</p>
        {result.isOlderVersion && (
          <Tooltip content={t('history.older_version_notice')}>
            <Info className="size-4 shrink-0 text-muted-foreground" />
          </Tooltip>
        )}
      </div>
      {result.studentName && (
        // Only a teacher gets the name, when the result is a student's.
        <p className="text-sm text-muted-foreground" data-testid="result-student">
          {t('history.result_student', { name: result.studentName })}
        </p>
      )}
      <p className="font-serif text-[40px] leading-tight font-medium tabular-nums">
        {format.number(result.score ?? 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
      </p>
      {hasPoints && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {t('exam.points', { earned: formatPoints(format, result.earnedPoints ?? 0), total: result.totalPoints ?? 0 })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{formatDate(result.createdAt, prefs)}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {summary.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ResultMark status={status} showWord={false} />
            {t(SUMMARY_KEYS[status], { count })}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface EntryRowProps {
  entry: ResultEntry;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function EntryRow({ entry, isSelected, onSelect }: EntryRowProps) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <button
      type="button"
      data-outline-pick
      aria-current={isSelected ? 'true' : undefined}
      onClick={() => onSelect(entry.id)}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted',
        'aria-[current=true]:bg-muted'
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{entry.number}</span>
        <span className="min-w-0 flex-1 truncate">{toPlainPreview(entry.title)}</span>
      </span>
      <span className="flex items-center gap-2 pl-7">
        <ResultMark status={entry.status} />
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('exam.points', {
            earned: entry.earnedPoints == null ? '—' : formatPoints(format, entry.earnedPoints),
            total: formatPoints(format, entry.maxPoints),
          })}
        </span>
      </span>
    </button>
  );
}
