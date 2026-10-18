'use client';

import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SpaceKind } from '@/client';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { displayTitle } from '@/lib/displayTitle';
import { Routes } from '@/lib/routes';

import { useCourse } from '../hooks/useCourse';
import { courseBackHref } from '../lib/spaceCrumbs';
import { spaceHref } from '../lib/spaceHref';

type Props = {
  courseId: string;
  noteTitle: string;
};

/**
 * Breadcrumb of a note in a course: Courses › course › note. A course note has no folder,
 * so the file breadcrumb (folders, siblings, rename) does not apply.
 */
export function CourseNoteBreadcrumb({ courseId, noteTitle }: Props) {
  const t = useTranslations();
  const { data: course } = useCourse(courseId);
  const goBack = useBackNavigation(course ? spaceHref(course) : Routes.COURSES);

  return (
    <nav aria-label={t('files.breadcrumb_label')} className="flex min-w-0 items-center gap-1 text-sm">
      <button
        type="button"
        onClick={goBack}
        aria-label={t('common.back')}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div className="hidden items-center gap-0.5 lg:flex">
        {/* A note placed straight in a classroom has the classroom as its home, not Courses. */}
        {course?.kind === SpaceKind.CLASSROOM ? (
          <Crumb href={Routes.CLASSROOMS}>{t('classrooms.title')}</Crumb>
        ) : course?.parentId ? (
          <>
            <Crumb href={Routes.CLASSROOMS}>{t('classrooms.title')}</Crumb>
            <Sep />
            <Crumb href={courseBackHref(course)}>{course.parentTitle}</Crumb>
          </>
        ) : (
          <Crumb href={Routes.COURSES}>{t('courses.title')}</Crumb>
        )}
        <Sep />
        {course && (
          <>
            <Crumb href={spaceHref(course)}>{course.title}</Crumb>
            <Sep />
          </>
        )}
      </div>
      <span className="min-w-0 truncate px-1.5 text-foreground">{displayTitle(noteTitle, t)}</span>
    </nav>
  );
}

function Crumb({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="max-w-48 truncate rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function Sep() {
  return <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />;
}
