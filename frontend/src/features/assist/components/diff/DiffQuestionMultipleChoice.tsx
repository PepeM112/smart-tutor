import { Check, X } from 'lucide-react';

import type { MultipleChoiceContent } from '@/client';

import type { DiffQuestionProps } from './types';

export function DiffQuestionMultipleChoice({ old: oldQ, new: newQ }: DiffQuestionProps) {
  // SAFETY: caller only renders this component for MULTIPLE_CHOICE-type question diffs
  const oldContent = oldQ.content as MultipleChoiceContent;
  const newContent = newQ.content as MultipleChoiceContent;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-feedback-wrong-border bg-feedback-wrong-bg p-3 space-y-2">
        <p className="text-sm text-foreground font-medium">{oldQ.prompt}</p>
        <div className="space-y-1 pl-1">
          {oldContent.options.map((opt, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
              {oldContent.correctIndices.includes(i) ? (
                <Check className="size-3.5 shrink-0 mt-0.5 text-feedback-correct" />
              ) : (
                <X className="size-3.5 shrink-0 mt-0.5 text-feedback-wrong" />
              )}
              <span>{opt}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-feedback-correct-border bg-feedback-correct-bg p-3 space-y-2">
        <p className="text-sm text-foreground font-medium">{newQ.prompt}</p>
        <div className="space-y-1 pl-1">
          {newContent.options.map((opt, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
              {newContent.correctIndices.includes(i) ? (
                <Check className="size-3.5 shrink-0 mt-0.5 text-feedback-correct" />
              ) : (
                <X className="size-3.5 shrink-0 mt-0.5 text-feedback-wrong" />
              )}
              <span>{opt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
