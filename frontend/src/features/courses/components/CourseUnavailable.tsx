'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { errorStatus } from '@/lib/utils';

import { type useCourseActions } from '../hooks/useCourseActions';

type Props = {
  status: number | undefined;
  actions: ReturnType<typeof useCourseActions>;
  /** A classroom has no "ask to join" by id: the student needs the join code or an invitation. */
  isClassroom?: boolean;
};

/**
 * A 403 is a course the user can not see (PRIVATE, or not published): they can still ask to join.
 * A 403 does not say if the course belongs to a classroom. Joining a course of a classroom answers 404
 * (only the classroom can be joined), so after that answer we show the classroom text instead.
 */
export function CourseUnavailable({ status, actions, isClassroom = false }: Props) {
  const t = useTranslations();

  if (status !== 403) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t(isClassroom ? 'classrooms.not_found' : 'courses.not_found')}
      </p>
    );
  }
  if (isClassroom) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('classrooms.no_access')}</p>;
  }
  if (errorStatus(actions.join.error) === 404) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('courses.classroom_course_no_access')}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">{t('courses.no_access')}</p>
      <Button loading={actions.join.isPending} onClick={() => actions.join.mutate()}>
        {t('courses.request_to_join')}
      </Button>
    </div>
  );
}
