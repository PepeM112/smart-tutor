import { Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { displayTitle } from '@/lib/displayTitle';
import { cn } from '@/lib/utils';

import { type SiblingEntry } from '../lib/siblings';

type Props = {
  siblings: SiblingEntry[];
  children: ReactNode;
};

/**
 * HoverCard that lists the items next to the trigger (same parent) as links.
 * With no siblings it renders only the trigger, so no empty card can open.
 */
export function SiblingCard({ siblings, children }: Props) {
  if (siblings.length === 0) return <>{children}</>;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-auto min-w-[160px] p-0">
        <SiblingList siblings={siblings} />
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── SiblingList ──────────────────────────────────────────────────────────────

function SiblingList({ siblings }: { siblings: SiblingEntry[] }) {
  const t = useTranslations();

  return (
    <ul className="max-h-60 overflow-y-auto py-0.5">
      {siblings.map(s => (
        <li key={s.id}>
          <Link
            href={s.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              s.isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {s.isCurrent && <Check className="size-3 shrink-0" />}
            <span className={cn('truncate max-w-[200px]', !s.isCurrent && 'pl-5')}>{displayTitle(s.name, t)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
