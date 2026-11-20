'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { type ItemRowAction } from '../lib/itemAction';

/**
 * The course content layout (ST-66 style 5): no cards, a muted header bar per section, plain rows below.
 * The outline (members) and the draft editor (authors) both use these frames, so both look the same.
 */
export function CourseContentFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

type SectionFrameProps = {
  /** The drag handle, at the start of the header (edit mode). */
  dragHandle?: ReactNode;
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
export function CourseSectionFrame({
  dragHandle,
  title,
  itemCount,
  titleSlot,
  actions,
  footer,
  children,
}: SectionFrameProps) {
  const t = useTranslations();

  return (
    <section className="flex flex-col">
      <div className="group flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
        {dragHandle}
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

type ItemRowProps = {
  /** The drag handle, at the start of the row (edit mode). */
  dragHandle?: ReactNode;
  /** Set by dnd-kit's `useSortable`, with `style` and `isDragging`. */
  sortableRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  icon: ReactNode;
  title: string;
  /** M3: the progress circle goes here, before the icon. */
  progress?: ReactNode;
  /** A badge after the title. */
  badge?: ReactNode;
  /** An icon with a tooltip. It is outside the row link or button: a tooltip is a control, and a control cannot nest in another. */
  marker?: ReactNode;
  /** Row buttons, in a `TreeActionsCell` (hover on desktop). */
  actions?: ReactNode;
  /** Leave it out for a static row. */
  action?: ItemRowAction;
  /** The row that a link or the Assistant pointed at (`?item=`): it is marked and scrolled into view. */
  isSelected?: boolean;
};

/** One item row. Lighter than the section header: no band, a hover surface only when it is interactive. */
export function CourseItemRow({
  dragHandle,
  sortableRef,
  style,
  isDragging,
  icon,
  title,
  progress,
  badge,
  marker,
  actions,
  action,
  isSelected,
}: ItemRowProps) {
  const rowRef = useRef<HTMLLIElement | null>(null);
  const setRef = useCallback(
    (node: HTMLLIElement | null) => {
      rowRef.current = node;
      sortableRef?.(node);
    },
    [sortableRef]
  );

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'center' });
  }, [isSelected]);

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
      ref={setRef}
      style={style}
      data-selected={isSelected || undefined}
      // px-3: the row text lines up with the section title in the header bar.
      className={cn(
        'group flex items-center gap-2 rounded-lg px-3',
        action && 'transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted',
        isDragging && 'relative z-10 bg-muted opacity-80 shadow-card'
      )}
    >
      {dragHandle}
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
      {marker}
      {actions}
    </li>
  );
}
