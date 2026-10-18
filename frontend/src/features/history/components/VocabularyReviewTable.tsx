'use client';

import { useTranslations } from 'next-intl';

import { type AnswerRead } from '@/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  effectiveStatus,
  getCorrectAnswer,
  getUserAnswerDisplay,
  isAnswerWrong,
  type ResultQuestion,
} from './resultDetailUtils';
import { StatusIcon } from './StatusIcon';

export function VocabularyReviewTable({
  questions,
  answerMap,
}: {
  questions: ResultQuestion[];
  answerMap: Map<string, AnswerRead>;
}) {
  const t = useTranslations();
  // A stripped test (a course attempt that hides the answers) has no answer key: the column would be empty (F17).
  const hasAnswerKey = questions.some(q => getCorrectAnswer(q) !== '');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{t('history.column_question')}</TableHead>
          <TableHead>{t('history.column_your_answer')}</TableHead>
          {hasAnswerKey && <TableHead>{t('history.correct_answer')}</TableHead>}
          <TableHead className="w-32 text-right">{t('history.column_result')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => {
          const answer = answerMap.get(q.id);
          const status = effectiveStatus(answer);
          const isWrong = isAnswerWrong(status);
          return (
            <TableRow key={q.id}>
              <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
              <TableCell className="font-medium">
                {q.prompt}
                {q.hint && <span className="text-xs text-muted-foreground italic ml-2">({q.hint})</span>}
              </TableCell>
              <TableCell>
                <span className={cn(isWrong && 'line-through text-muted-foreground')}>
                  {(answer && getUserAnswerDisplay(q, answer.userAnswer)) ?? t('history.no_answer')}
                </span>
              </TableCell>
              {hasAnswerKey && (
                <TableCell>
                  <span className="text-feedback-correct font-medium">{getCorrectAnswer(q)}</span>
                </TableCell>
              )}
              <TableCell className="text-right">
                <StatusIcon status={status} className="ml-auto" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
