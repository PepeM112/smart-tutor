'use client';

import { Archive, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SpaceStatus, type SpaceSummary } from '@/client';
import { courseHref } from '@/lib/routes';

import { ROLE_LABELS, VISIBILITY_LABELS } from '../lib/labels';

import type { ReactNode } from 'react';

type Props = {
  course: SpaceSummary;
  /** Buttons under the card body (e.g. accept / decline an invitation). */
  footer?: ReactNode;
};

/** A course in a list: title, owner, description, visibility, members. The body links to the course page. */
export function CourseCard({ course, footer }: Props) {
  const t = useTranslations();
  const isArchived = course.status === SpaceStatus.ARCHIVED;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-card">
      <Link href={courseHref(course)} className="flex flex-1 flex-col gap-2 p-4 transition-colors hover:bg-muted/40">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium text-foreground">{course.title}</h3>
          {course.myRole !== null && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t(ROLE_LABELS[course.myRole])}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('courses.by_owner', { name: course.ownerName })}</p>
        {course.description && <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
          <span>{t(VISIBILITY_LABELS[course.visibility])}</span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {t('courses.member_count', { count: course.memberCount })}
          </span>
          {course.publishedAt === null && <span>{t('courses.not_published')}</span>}
          {isArchived && (
            <span className="flex items-center gap-1">
              <Archive className="size-3.5" />
              {t('courses.archived_badge')}
            </span>
          )}
        </div>
      </Link>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
    </div>
  );
}
