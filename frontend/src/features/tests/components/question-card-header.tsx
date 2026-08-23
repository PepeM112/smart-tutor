type Props = {
  title: string;
  points: string;
  chip?: string | null;
  index?: number;
};

export function QuestionCardHeader({ title, points, chip, index }: Props) {
  const displayTitle = index != null ? `${index + 1}. ${title}` : title;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-6">
      <p className="flex-1 text-sm font-medium">
        {displayTitle}
        <span className="ml-1.5 text-sm font-normal tabular-nums text-muted-foreground">({points})</span>
      </p>
      {chip && (
        <span className="shrink-0 self-start rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {chip}
        </span>
      )}
    </div>
  );
}
