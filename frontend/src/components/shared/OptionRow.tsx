import { RichText } from '@/components/shared/RichText';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

type OptionRowProps = {
  /** Status icon. The caller sets its size and color. */
  icon: ReactNode;
  text: string;
  className?: string;
  textClassName?: string;
};

/** Read-only answer option: a status icon and the option text as Markdown. */
export function OptionRow({ icon, text, className, textClassName }: OptionRowProps) {
  return (
    <div className={cn('flex items-start gap-2', className)}>
      {icon}
      <RichText text={text} className={cn('min-w-0', textClassName)} />
    </div>
  );
}
