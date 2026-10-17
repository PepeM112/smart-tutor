'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { courseHref, Routes } from '@/lib/routes';

import { useCourse } from '../hooks/useCourse';
import { useCourseActions } from '../hooks/useCourseActions';
import { COURSE_COLUMN_CLASS } from '../lib/layout';

import { CourseSettings } from './CourseSettings';

/** `/courses/[slug-id]/settings`: details, join code, duplicate, archive and delete. Owner only. */
export function CourseSettingsPage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: course, isLoading } = useCourse(courseId);
  const actions = useCourseActions(courseId);
  const isOwner = course?.isOwner ?? false;

  useBreadcrumb(
    t('courses.tab_settings'),
    [
      { label: t('courses.title'), href: Routes.COURSES },
      ...(course ? [{ label: course.title, href: courseHref(course) }] : []),
    ],
    course ? courseHref(course) : Routes.COURSES
  );

  // Other users go back to the course page, which shows the right view (or the "no access" message).
  useEffect(() => {
    if (!isLoading && !isOwner) router.replace(course ? courseHref(course) : Routes.COURSES);
  }, [isLoading, isOwner, course, router]);

  if (!course || !isOwner) return <LoadingSpinner />;

  return (
    <div className={COURSE_COLUMN_CLASS}>
      <div className="flex flex-col gap-1">
        <Link
          href={courseHref(course)}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t('courses.back_to_course')}
        </Link>
        <h2 className="text-2xl font-semibold text-foreground">{t('courses.tab_settings')}</h2>
      </div>
      <CourseSettings course={course} actions={actions} />
    </div>
  );
}
