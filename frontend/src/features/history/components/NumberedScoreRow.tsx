import { getScoreTextColor } from '@/features/history/utils/scoreColors';
import { cn } from '@/lib/utils';

export function NumberedScoreRow({
  number,
  title,
  correctCount,
  totalCount,
}: {
  number: number;
  title: string;
  correctCount: number;
  totalCount: number;
}) {
  const pct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  return (
    <div className="flex items-start justify-between gap-2">
      <p className="font-medium">
        <span className="text-muted-foreground mr-1.5">{number}.</span>
        {title}
      </p>
      <span className={cn('text-sm font-semibold tabular-nums shrink-0', getScoreTextColor(pct))}>
        {correctCount.toFixed(2)}/{totalCount.toFixed(2)}
      </span>
    </div>
  );
}
