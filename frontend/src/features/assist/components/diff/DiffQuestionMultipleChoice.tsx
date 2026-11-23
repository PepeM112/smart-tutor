import { Check, X } from 'lucide-react';

import { OptionRow } from '@/components/shared/OptionRow';
import { RichText } from '@/components/shared/RichText';
import { isMCContent } from '@/features/tests/utils/questionContent';

import type { DiffQuestionProps } from './types';

function OptionIcon({ correct }: { correct: boolean }) {
  return correct ? (
    <Check className="size-3.5 shrink-0 mt-0.5 text-feedback-correct" />
  ) : (
    <X className="size-3.5 shrink-0 mt-0.5 text-feedback-wrong" />
  );
}

export function DiffQuestionMultipleChoice({ old: oldQ, new: newQ }: DiffQuestionProps) {
  if (!isMCContent(oldQ.content) || !isMCContent(newQ.content)) return null;
  const oldContent = oldQ.content;
  const newContent = newQ.content;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-feedback-wrong-border bg-feedback-wrong-bg p-3 space-y-2">
        <RichText text={oldQ.prompt} className="text-sm text-foreground font-medium" />
        <div className="space-y-1 pl-1">
          {oldContent.options.map((opt, i) => (
            <OptionRow
              key={i}
              icon={<OptionIcon correct={oldContent.correctIndices.includes(i)} />}
              text={opt}
              className="text-xs text-foreground/80"
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-feedback-correct-border bg-feedback-correct-bg p-3 space-y-2">
        <RichText text={newQ.prompt} className="text-sm text-foreground font-medium" />
        <div className="space-y-1 pl-1">
          {newContent.options.map((opt, i) => (
            <OptionRow
              key={i}
              icon={<OptionIcon correct={newContent.correctIndices.includes(i)} />}
              text={opt}
              className="text-xs text-foreground/80"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
