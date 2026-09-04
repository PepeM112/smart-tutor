import { cn } from '@/lib/utils';

type Props = {
  mode: 'view' | 'edit';
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
};

export function QuestionBlockWrapper({ mode, selected, onClick, className, children }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border bg-card text-sm shadow-card transition-colors sm:text-base',
        mode === 'view' ? 'overflow-hidden' : 'p-4',
        selected && 'bg-muted/60',
        className
      )}
    >
      {children}
    </div>
  );
}
