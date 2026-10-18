'use client';

import { CalendarClock, FileText, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { SpaceItemKind, type DueSoonItem } from '@/client';
import { courseAttemptHref, courseItemHref } from '@/lib/routes';

import { useDueSoon } from '../hooks/useClassrooms';

/** Students: the next items with a due date, at the top of Classwork. It shows nothing when there are none. */
export function DueSoonList({ classroomId }: { classroomId: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const { data: items = [] } = useDueSoon(classroomId);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-label={t('classrooms.due_soon')}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
        {t('classrooms.due_soon')}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {items.map(item => (
          <li key={item.itemId}>
            <Link
              href={itemHref(item)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40"
            >
              {item.kind === SpaceItemKind.TEST ? (
                <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{item.title}</span>
                {/* The course of the item, when it is not in the classroom itself. */}
                {item.spaceId !== item.classroomId && (
                  <span className="block truncate text-xs text-muted-foreground">{item.spaceTitle}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('courses.schedule_label_due', {
                  date: format.dateTime(item.dueAt, { dateStyle: 'short', timeStyle: 'short' }),
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A test opens its attempt page; a note opens in its space with the item marked. */
function itemHref(item: DueSoonItem): string {
  const space = { id: item.spaceId, title: item.spaceTitle };
  return item.kind === SpaceItemKind.TEST ? courseAttemptHref(space, item.itemId) : courseItemHref(space, item.itemId);
}
