type Props = {
  title: string;
  points: string;
  chip?: string | null;
};

export function QuestionCardHeader({ title, points, chip }: Props) {
  return (
    <>
      {/* Desktop: single row */}
      <div className="hidden sm:flex items-start gap-3 px-6 py-3">
        <p className="flex-1 text-sm font-medium">
          {title}
          <span className="ml-1.5 text-sm font-normal tabular-nums text-muted-foreground">({points})</span>
        </p>
        {chip && (
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{chip}</span>
        )}
      </div>

      {/* Mobile: two rows */}
      <div className="flex sm:hidden flex-col gap-1.5 px-6 py-3">
        <p className="text-sm font-medium">
          {title}
          <span className="ml-1.5 text-sm font-normal tabular-nums text-muted-foreground">({points})</span>
        </p>
        {chip && (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{chip}</span>
          </div>
        )}
      </div>
    </>
  );
}
