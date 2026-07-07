'use client';

import { Check, X } from 'lucide-react';

import { type AnswerRead, type RubricResultItem } from '@/client';
import { cn } from '@/lib/utils';

export function LongTextReview({ answer }: { answer?: AnswerRead }) {
  if (!answer) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Your answer:</p>
        <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">{answer.userAnswer}</p>
      </div>
      {answer.rubricResult && answer.rubricResult.length > 0 && <RubricBreakdown items={answer.rubricResult} />}
    </div>
  );
}

function RubricBreakdown({ items }: { items: RubricResultItem[] }) {
  const metCount = items.filter(i => i.met).length;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Rubric ({metCount}/{items.length} criteria met)
      </p>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-md border-l-[3px] px-3 py-2',
              item.met
                ? 'border-l-feedback-correct bg-feedback-correct-bg'
                : 'border-l-destructive bg-feedback-wrong-bg'
            )}
          >
            <div className="flex items-start gap-2">
              {item.met ? (
                <Check className="size-4 text-feedback-correct shrink-0 mt-0.5" />
              ) : (
                <X className="size-4 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm">
                  {item.point}
                  <span className="text-muted-foreground ml-1.5 tabular-nums">({item.weight.toFixed(2)})</span>
                </p>
                {item.reason && <p className="text-xs text-muted-foreground italic">{item.reason}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
