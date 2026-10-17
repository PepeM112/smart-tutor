'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SpaceStatus, type SpaceSummary } from '@/client';
import { HoverHint } from '@/components/ui/hover-hint';
import { courseHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { ROLE_ICONS, ROLE_LABELS, VISIBILITY_ICONS, VISIBILITY_LABELS } from '../lib/labels';

import type { LucideIcon } from 'lucide-react';

type Props = {
  course: SpaceSummary;
};

/** A course in a grid: title, owner, description, status badges, visibility and role icons. It links to the course page. */
export function CourseCard({ course }: Props) {
  const t = useTranslations();
  const isArchived = course.status === SpaceStatus.ARCHIVED;
  const isDraft = course.publishedAt === null;

  return (
    <Link
      href={courseHref(course)}
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border p-4 shadow-card transition-colors',
        // An archived course is read-only: a muted surface tells the user before they open it.
        isArchived ? 'bg-muted/60 hover:bg-muted' : 'bg-card hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn('line-clamp-2 font-medium', isArchived ? 'text-muted-foreground' : 'text-foreground')}>
          {course.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <IconHint icon={VISIBILITY_ICONS[course.visibility]} label={t(VISIBILITY_LABELS[course.visibility])} />
          {course.myRole !== null && (
            <IconHint icon={ROLE_ICONS[course.myRole]} label={t(ROLE_LABELS[course.myRole])} />
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('courses.by_owner', { name: course.ownerName })}</p>
      {course.description && <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>}
      {(isArchived || isDraft) && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {isArchived && <StatusBadge>{t('courses.archived_badge')}</StatusBadge>}
          {isDraft && <StatusBadge>{t('courses.draft_badge')}</StatusBadge>}
        </div>
      )}
    </Link>
  );
}

/** An icon with a hover label. The label is also in the accessible name, because the hint shows on hover only. */
function IconHint({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <HoverHint label={label}>
      <span className="inline-flex">
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    </HoverHint>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
