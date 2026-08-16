'use client';

import { useTranslations } from 'next-intl';

import { type AnswerRead, type QuestionRead } from '@/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { getCorrectAnswer, getUserAnswerDisplay, isAnswerWrong } from './result-detail-utils';
import { StatusIcon } from './status-icon';

export function VocabularyReviewTable({
  questions,
  answerMap,
}: {
  questions: QuestionRead[];
  answerMap: Map<string, AnswerRead>;
}) {
  const t = useTranslations();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{t('history.column_question')}</TableHead>
          <TableHead>{t('history.column_your_answer')}</TableHead>
          <TableHead>{t('history.correct_answer')}</TableHead>
          <TableHead className="w-32 text-right">{t('history.column_result')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => {
          const answer = answerMap.get(q.id);
          const status = answer?.status ?? null;
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
              <TableCell>
                <span className="text-feedback-correct font-medium">{getCorrectAnswer(q)}</span>
              </TableCell>
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
