import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { displayTitle } from '@/lib/displayTitle';

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
            className="flex items-center gap-2 rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span className="truncate max-w-[200px]">{displayTitle(s.name, t)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
