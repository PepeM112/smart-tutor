'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { courseHref, Routes } from '@/lib/routes';
import { errorStatus } from '@/lib/utils';

import { useCourse } from '../hooks/useCourse';
import { useCourseActions } from '../hooks/useCourseActions';
import { COURSE_COLUMN_CLASS } from '../lib/layout';

import { CourseSettings } from './CourseSettings';
import { CourseUnavailable } from './CourseUnavailable';

/** `/courses/[slug-id]/settings`: details, join code, duplicate, archive and delete. Owner only. */
export function CourseSettingsPage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: course, isLoading, error } = useCourse(courseId);
  const actions = useCourseActions(courseId);

  useBreadcrumb(
    t('courses.tab_settings'),
    [
      { label: t('courses.title'), href: Routes.COURSES },
      ...(course ? [{ label: course.title, href: courseHref(course) }] : []),
    ],
    course ? courseHref(course) : Routes.COURSES
  );

  // Other users go back to the course page, which shows the right view.
  useEffect(() => {
    if (course && !course.isOwner) router.replace(courseHref(course));
  }, [course, router]);

  if (isLoading) return <LoadingSpinner />;
  // Same rule as the course page: a failed refetch keeps the old `data`, so the status is checked too.
  const status = errorStatus(error);
  if (!course || status === 403 || status === 404) return <CourseUnavailable status={status} actions={actions} />;
  // A non-owner sees the spinner until the redirect above ends.
  if (!course.isOwner) return <LoadingSpinner />;

  return (
    <div className={COURSE_COLUMN_CLASS}>
      <CourseSettings course={course} actions={actions} />
    </div>
  );
}
