import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

type Props = {
  /** False: a spacer of the same size shows, so names of all rows line up. */
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * Expand / collapse button of a folder row. A folder with no children cannot open,
 * so it gets an empty spacer. The row stays aligned with the others.
 */
export function TreeChevron({ hasChildren, expanded, onToggle }: Props) {
  const t = useTranslations();

  if (!hasChildren) return <span className="size-5 shrink-0" />;

  return (
    <button
      type="button"
      aria-label={expanded ? t('files.collapse_folder') : t('files.expand_folder')}
      aria-expanded={expanded}
      onClick={e => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronRight className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-90')} />
    </button>
  );
}
