'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SpaceStatus, type SpaceSummary } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { HoverHint } from '@/components/ui/hover-hint';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { applyCourseDetail, courseQueryKeys, markCourseDetailStale } from '../lib/queryKeys';
import { spaceHref } from '../lib/spaceHref';

/**
 * The Mail icon in the `/courses` header. The badge shows the number of open invitations.
 * The popover lists them with Accept / Decline. (M5 moves this into the global notification bell.)
 */
export function InvitationsButton() {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const {
    data: invitations = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: courseQueryKeys.invitations(),
    queryFn: async (): Promise<SpaceSummary[]> => (await sdk.spacesInvitations({ throwOnError: true })).data,
  });

  const { mutate: acceptInvitation, isPending: isAccepting } = useMutation({
    mutationFn: async (courseId: string) =>
      (await sdk.spacesAcceptInvitation({ path: { space_id: courseId }, throwOnError: true })).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t('courses.joined'));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_join'))),
  });

  const { mutate: declineInvitation, isPending: isDeclining } = useMutation({
    mutationFn: (courseId: string) => sdk.spacesDeclineInvitation({ path: { space_id: courseId }, throwOnError: true }),
    onSuccess: (_res, courseId) => {
      void queryClient.invalidateQueries({ queryKey: courseQueryKeys.invitations() });
      // The course page may be cached with `myStatus: INVITED`: it must not show Accept / Decline again.
      markCourseDetailStale(queryClient, courseId);
      toast.success(t('courses.invitation_declined'));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_save'))),
  });

  const count = invitations.length;
  const label = count > 0 ? `${t('courses.invitations')} (${count})` : t('courses.invitations');

  return (
    <FloatingCard>
      <HoverHint label={t('courses.invitations')}>
        <FloatingCardTrigger>
          <Button variant="outline" size="icon-lg" aria-label={label} className="relative">
            <Mail />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4.5 rounded-full bg-primary px-1 text-center text-[11px] leading-4.5 font-medium text-primary-foreground tabular-nums">
                {count}
              </span>
            )}
          </Button>
        </FloatingCardTrigger>
      </HoverHint>
      <FloatingCardContent align="end" className="flex w-80 flex-col gap-3">
        <h2 className="text-sm font-medium">{t('courses.invitations')}</h2>
        <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load')}>
          {count === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('courses.no_invitations')}</p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
              {invitations.map(course => {
                // The backend refuses to accept an invitation to an archived course (409), so only Decline shows.
                const isArchived = course.status === SpaceStatus.ARCHIVED;
                return (
                  <li key={course.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={spaceHref(course)} className="line-clamp-2 text-sm font-medium hover:underline">
                        {course.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {t('courses.by_owner', { name: course.ownerName })}
                        {isArchived && ` · ${t('courses.archived_badge')}`}
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeclining || isAccepting}
                        onClick={() => declineInvitation(course.id)}
                      >
                        {t('courses.decline')}
                      </Button>
                      {!isArchived && (
                        <Button
                          size="sm"
                          disabled={isAccepting || isDeclining}
                          onClick={() => acceptInvitation(course.id)}
                        >
                          {t('courses.accept')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryState>
      </FloatingCardContent>
    </FloatingCard>
  );
}
