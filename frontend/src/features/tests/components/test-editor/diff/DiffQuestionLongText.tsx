import type { LongTextContent } from '@/client';

import type { DiffQuestionProps } from './types';

export function DiffQuestionLongText({ old: oldQ, new: newQ }: DiffQuestionProps) {
  const oldContent = oldQ.content as LongTextContent;
  const newContent = newQ.content as LongTextContent;

  return (
    <div className="space-y-2">
      {/* Old question */}
      <div className="rounded-lg border border-feedback-wrong-border bg-feedback-wrong-bg p-3 space-y-1.5">
        <p className="text-sm text-foreground font-medium">{oldQ.prompt}</p>
        <div className="space-y-0.5">
          {oldContent.rubric.map((r, i) => (
            <p key={i} className="text-xs text-foreground/80">
              • {r.point} ({Math.round(r.weight * 100)}%)
            </p>
          ))}
        </div>
      </div>

      {/* New question */}
      <div className="rounded-lg border border-feedback-correct-border bg-feedback-correct-bg p-3 space-y-1.5">
        <p className="text-sm text-foreground font-medium">{newQ.prompt}</p>
        <div className="space-y-0.5">
          {newContent.rubric.map((r, i) => (
            <p key={i} className="text-xs text-foreground/80">
              • {r.point} ({Math.round(r.weight * 100)}%)
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
