'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { type useCourseActions } from '../hooks/useCourseActions';

type Props = {
  status: number | undefined;
  actions: ReturnType<typeof useCourseActions>;
};

/** A 403 is a course the user can not see (PRIVATE, or not published): they can still ask to join. */
export function CourseUnavailable({ status, actions }: Props) {
  const t = useTranslations();

  if (status !== 403) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('courses.not_found')}</p>;
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
