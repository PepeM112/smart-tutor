'use client';

import { CheckCircle2, Circle, MinusCircle, XCircle } from 'lucide-react';

import { isMCContent } from '@/features/tests/utils/questionContent';
import { cn } from '@/lib/utils';

import { getMcOptions, parseSelectedIndices, type ResultQuestion } from './resultDetailUtils';

export function MultipleChoiceReview({ question, userAnswer }: { question: ResultQuestion; userAnswer: string }) {
  const { content } = question;
  const options = getMcOptions(question);
  if (!options) return null;

  // A stripped question has no answer key: the review shows only what the student chose.
  const correctIndices = isMCContent(content) ? new Set(content.correctIndices) : null;
  const selectedIndices = new Set(parseSelectedIndices(userAnswer));

  return (
    <div className="space-y-1">
      {options.map((option, idx) => {
        const isSelected = selectedIndices.has(idx);
        const isCorrect = correctIndices?.has(idx) ?? false;

        let bg = '';
        let Icon = Circle;
        let iconColor = 'text-muted-foreground/40';

        if (!correctIndices) {
          if (isSelected) {
            bg = 'bg-muted';
            Icon = CheckCircle2;
            iconColor = 'text-foreground';
          }
        } else if (isSelected && isCorrect) {
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
