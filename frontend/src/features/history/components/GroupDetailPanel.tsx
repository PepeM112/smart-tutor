'use client';

import { type AnswerRead, QuestionGroupType } from '@/client';

import { QuestionDetailPanel } from './QuestionDetailPanel';
import { type ResultQuestion } from './resultDetailUtils';
import { VocabularyReviewTable } from './VocabularyReviewTable';

interface GroupDetailPanelProps {
  type?: QuestionGroupType;
  questions: ResultQuestion[];
  answerMap: Map<string, AnswerRead>;
}

/** The questions of a group. The title and the score are drawn by the caller. */
export function GroupDetailPanel({ type, questions, answerMap }: GroupDetailPanelProps) {
  if (type === QuestionGroupType.VOCABULARY) {
    return <VocabularyReviewTable questions={questions} answerMap={answerMap} />;
  }

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-4 rounded-lg border border-border p-4">
          <p className="font-medium">
            <span className="mr-1.5 text-muted-foreground">{idx + 1}.</span>
            {q.prompt}
          </p>
          <QuestionDetailPanel question={q} answer={answerMap.get(q.id)} />
        </div>
      ))}
    </div>
  );
}
