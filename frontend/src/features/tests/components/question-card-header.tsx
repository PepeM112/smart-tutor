'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';

import { QuestionBlockAction } from './question-block-action';

type Props = {
  title: string;
  points: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  chip?: string | null;
};

export function QuestionCardHeader({ title, points, expanded, onToggle, onRemove, chip }: Props) {
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      {/* Desktop: single row */}
      <div
        onClick={onToggle}
        className="hidden sm:flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <Chevron className="size-4 shrink-0 text-muted-foreground" />
        <p className="flex-1 truncate text-sm font-medium">{title}</p>
        {chip && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {chip}
          </span>
        )}
        <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {points}
        </span>
        <QuestionBlockAction onRemove={onRemove} />
      </div>

      {/* Mobile: two rows */}
      <div
        onClick={onToggle}
        className="flex sm:hidden flex-col gap-1.5 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Chevron className="size-4 shrink-0 text-muted-foreground" />
          <p className="flex-1 truncate text-sm font-medium">{title}</p>
          <QuestionBlockAction onRemove={onRemove} />
        </div>
        <div className="flex items-center gap-2 pl-6">
          {chip && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {chip}
            </span>
          )}
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {points}
          </span>
        </div>
      </div>
    </>
  );
}
