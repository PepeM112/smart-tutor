'use client';

import { type AnswerRead, type QuestionRead, QuestionGroupType } from '@/client';
import { getScoreTextColor } from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

import { QuestionDetailPanel } from './question-detail-panel';
import { countCorrectInGroup } from './result-detail-utils';
import { VocabularyReviewTable } from './vocabulary-review-table';

export default function GroupDetailPanel({
  title,
  type,
  questions,
  answerMap,
  number,
}: {
  title: string;
  type?: QuestionGroupType;
  questions: QuestionRead[];
  answerMap: Map<string, AnswerRead>;
  number: number;
}) {
  const correctCount = countCorrectInGroup(questions, answerMap);
  const totalCount = questions.length;
  const pct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          <span className="text-muted-foreground mr-1.5">{number}.</span>
          {title}
        </p>
        <span className={cn('text-sm font-semibold tabular-nums shrink-0', getScoreTextColor(pct))}>
          {correctCount.toFixed(2)}/{totalCount.toFixed(2)}
        </span>
      </div>

      {type === QuestionGroupType.VOCABULARY ? (
        <VocabularyReviewTable questions={questions} answerMap={answerMap} />
      ) : (
        <div className="divide-y divide-border">
          {questions.map((q, idx) => (
            <div key={q.id} className={idx > 0 ? 'pt-4' : ''}>
              <QuestionDetailPanel question={q} answer={answerMap.get(q.id)} number={idx + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
