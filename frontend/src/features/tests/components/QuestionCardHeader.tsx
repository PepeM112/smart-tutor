import { RichText } from '@/components/RichText';

type Props = {
  title: string;
  points: string;
  chip?: string | null;
  index?: number;
};

type PromptLineProps = {
  prefix: string;
  text: string;
  points: string;
};

/** A one-line prompt keeps its points right after the text. A multi-line one (code, lists) stacks them. */
export function PromptLine({ prefix, text, points }: PromptLineProps) {
  const pointsLabel = <span className="ml-1.5 text-sm font-normal tabular-nums text-muted-foreground">({points})</span>;

  if (!text.includes('\n')) {
    return (
      <div className="text-sm font-medium">
        {prefix}
        <RichText text={text} inline />
        {pointsLabel}
      </div>
    );
  }

  return (
    <div className="text-sm font-medium">
      <div className="flex gap-1.5">
        {prefix && <span className="shrink-0">{prefix}</span>}
        <RichText text={text} className="min-w-0 flex-1" />
      </div>
      {pointsLabel}
    </div>
  );
}

export function QuestionCardHeader({ title, points, chip, index }: Props) {
  const prefix = index != null ? `${index + 1}. ` : '';

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <PromptLine prefix={prefix} text={title} points={points} />
      </div>
      {chip && (
        <span className="shrink-0 self-start rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {chip}
        </span>
      )}
    </div>
  );
}
