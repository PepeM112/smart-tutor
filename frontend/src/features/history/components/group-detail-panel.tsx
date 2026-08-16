'use client';

import { type AnswerRead, type QuestionRead, QuestionGroupType } from '@/client';

import { NumberedScoreRow } from './numbered-score-row';
import { QuestionDetailPanel } from './question-detail-panel';
import { countCorrectInGroup } from './result-detail-utils';
import { VocabularyReviewTable } from './vocabulary-review-table';

export function GroupDetailPanel({
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

  return (
    <div className="space-y-4">
      <NumberedScoreRow number={number} title={title} correctCount={correctCount} totalCount={totalCount} />

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
