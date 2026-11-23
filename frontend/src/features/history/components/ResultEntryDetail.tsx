'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { type AnswerRead } from '@/client';
import { RichText } from '@/components/shared/RichText';
import { Button } from '@/components/ui/button';
import { QUESTION_TYPE_LABEL_KEYS } from '@/features/tests/constants';

import { formatPoints, type ResultEntry } from '../utils/resultEntries';

import { GroupDetailPanel } from './GroupDetailPanel';
import { QuestionDetailPanel } from './QuestionDetailPanel';
import { ExamItemType, type ExamItem } from './resultDetailUtils';
import { ResultMark } from './ResultMark';

interface ResultEntryDetailProps {
  entry: ResultEntry;
  item: ExamItem;
  answerMap: Map<string, AnswerRead>;
  previous?: ResultEntry;
  next?: ResultEntry;
  onSelect: (id: string) => void;
}

/** The main pane of a result: the question that the outline selected. */
export function ResultEntryDetail({ entry, item, answerMap, previous, next, onSelect }: ResultEntryDetailProps) {
  return (
    <div className="space-y-6">
      <EntryHeader entry={entry} item={item} />
      {item.type === ExamItemType.QUESTION ? (
        <QuestionDetailPanel question={item.question} answer={answerMap.get(item.question.id)} />
      ) : (
        <GroupDetailPanel type={item.group.type} questions={item.group.questions ?? []} answerMap={answerMap} />
      )}
      <PrevNext previous={previous} next={next} onSelect={onSelect} />
    </div>
  );
}

function EntryHeader({ entry, item }: Pick<ResultEntryDetailProps, 'entry' | 'item'>) {
  const t = useTranslations();
  const format = useFormatter();
  const typeLabel =
    item.type === ExamItemType.QUESTION
      ? t(QUESTION_TYPE_LABEL_KEYS[item.question.questionType])
      : t('exam.group_label');

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t('history.question_meta', { number: entry.number, type: typeLabel })}
        </p>
        <p className="flex items-center gap-2 text-sm">
          <ResultMark status={entry.status} />
          <span className="text-muted-foreground tabular-nums">
            {t('exam.points', {
              earned: entry.earnedPoints == null ? '—' : formatPoints(format, entry.earnedPoints),
              total: formatPoints(format, entry.maxPoints),
            })}
          </span>
        </p>
      </div>
      {/* A div, not an h2: the title can hold block Markdown (code, lists). */}
      <div role="heading" aria-level={2} className="font-serif text-xl font-medium text-balance">
        <RichText text={entry.title} />
      </div>
    </header>
  );
}

interface PrevNextProps {
  previous?: ResultEntry;
  next?: ResultEntry;
  onSelect: (id: string) => void;
}

function PrevNext({ previous, next, onSelect }: PrevNextProps) {
  const t = useTranslations();

  return (
    <nav aria-label={t('history.question_navigation')} className="flex items-center justify-between gap-2 pt-2">
      {previous ? (
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={() => onSelect(previous.id)}>
          {t('history.previous_question')}
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button type="button" variant="ghost" onClick={() => onSelect(next.id)}>
          {t('history.next_question')}
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}
