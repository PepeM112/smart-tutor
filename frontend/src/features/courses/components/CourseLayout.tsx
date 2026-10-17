'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The course content layout (ST-66 style 5): no cards, a muted header bar per section, plain rows below.
 * The outline (members) and the draft editor (authors) both use these frames, so both look the same.
 */
export function CourseContentFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

type SectionFrameProps = {
  title: string;
  itemCount: number;
  /** Replaces the title, for example an inline rename field. */
  titleSlot?: ReactNode;
  /** Header buttons. They show on hover on desktop (`group` on the header). */
  actions?: ReactNode;
  /** Below the rows, for example "Add item". */
  footer?: ReactNode;
  children: ReactNode;
};

/** One section: a header (title + item count) and its rows. */
export function CourseSectionFrame({ title, itemCount, titleSlot, actions, footer, children }: SectionFrameProps) {
  const t = useTranslations();

  return (
    <section className="flex flex-col">
      <div className="group flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {titleSlot ?? <h3 className="truncate font-semibold text-foreground">{title}</h3>}
          {!titleSlot && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {t('courses.item_count', { count: itemCount })}
            </span>
          )}
        </div>
        {actions}
      </div>
      <ul className="flex flex-col pt-1">{children}</ul>
      {footer && <div className="px-2">{footer}</div>}
    </section>
  );
}

/** A row opens a page (`href`) or runs `onClick` (for example the note preview). */
export type ItemRowAction = { href: string } | { onClick: () => void };

type ItemRowProps = {
  icon: ReactNode;
  title: string;
  /** M3: the progress circle goes here, before the icon. */
  progress?: ReactNode;
  /** A badge after the title ("New", "Changed"). */
  badge?: ReactNode;
  /** Row buttons, in a `TreeActionsCell` (hover on desktop). */
  actions?: ReactNode;
  /** Leave it out for a static row. */
  action?: ItemRowAction;
};

/** One item row. Lighter than the section header: no band, a hover surface only when it is interactive. */
export function CourseItemRow({ icon, title, progress, badge, actions, action }: ItemRowProps) {
  const content = (
    <>
      {progress}
      {icon}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {badge}
    </>
  );
  const bodyClass = 'flex min-w-0 flex-1 items-center gap-3 py-2 text-left text-sm text-foreground';

  return (
    <li
      // px-3: the row text lines up with the section title in the header bar.
      className={cn('group flex items-center gap-2 rounded-lg px-3', action && 'transition-colors hover:bg-muted/50')}
    >
      {!action ? (
        <div className={bodyClass}>{content}</div>
      ) : 'href' in action ? (
        <Link href={action.href} className={bodyClass}>
          {content}
        </Link>
      ) : (
        <button type="button" className={bodyClass} onClick={action.onClick}>
          {content}
        </button>
      )}
      {actions}
    </li>
  );
}
