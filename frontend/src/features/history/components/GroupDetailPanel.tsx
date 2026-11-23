'use client';

import { type AnswerRead, QuestionGroupType } from '@/client';
import { RichText } from '@/components/shared/RichText';

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
          <div className="flex gap-1.5 font-medium">
            <span className="shrink-0 text-muted-foreground">{idx + 1}.</span>
            <RichText text={q.prompt} className="min-w-0 flex-1" />
          </div>
          <QuestionDetailPanel question={q} answer={answerMap.get(q.id)} />
        </div>
      ))}
    </div>
  );
}
