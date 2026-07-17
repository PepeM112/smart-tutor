'use client';

import { CheckCircle2, Circle, MinusCircle, XCircle } from 'lucide-react';

import { type QuestionRead } from '@/client';
import { isMCContent } from '@/features/tests/utils/question-content';
import { cn } from '@/lib/utils';

import { parseSelectedIndices } from './result-detail-utils';

export function MultipleChoiceReview({ question, userAnswer }: { question: QuestionRead; userAnswer: string }) {
  const { content } = question;
  if (!isMCContent(content)) return null;

  const correctIndices = new Set(content.correct_indices);
  const selectedIndices = new Set(parseSelectedIndices(userAnswer));

  return (
    <div className="space-y-1">
      {content.options.map((option, idx) => {
        const isSelected = selectedIndices.has(idx);
        const isCorrect = correctIndices.has(idx);

        let bg = '';
        let Icon = Circle;
        let iconColor = 'text-muted-foreground/40';

        if (isSelected && isCorrect) {
          bg = 'bg-feedback-correct-bg';
          Icon = CheckCircle2;
          iconColor = 'text-feedback-correct';
        } else if (!isSelected && isCorrect) {
          bg = 'bg-feedback-partial-bg';
          Icon = MinusCircle;
          iconColor = 'text-feedback-partial';
        } else if (isSelected && !isCorrect) {
          bg = 'bg-feedback-wrong-bg';
          Icon = XCircle;
          iconColor = 'text-destructive';
        }

        return (
          <div key={idx} className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5', bg)}>
            <Icon className={cn('size-4 shrink-0', iconColor)} />
            <span className="text-sm">{option}</span>
          </div>
        );
      })}
    </div>
  );
}
