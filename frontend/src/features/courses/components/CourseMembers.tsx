'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MemberStatus, SpaceRole, type SpaceDetail, type SpaceMemberRead } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { sdk } from '@/lib/apiClient';

import { type useCourseActions } from '../hooks/useCourseActions';
import { MEMBER_STATUS_LABELS, ROLE_LABELS } from '../lib/labels';
import { courseQueryKeys } from '../lib/queryKeys';

/** Same limit as the backend `identifier` field (an email can be 320 characters). */
const IDENTIFIER_MAX_LENGTH = 320;

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
};

/** The member list. Authors can read it; only the owner can invite, approve, change roles and remove. */
export function CourseMembers({ course, actions }: Props) {
  const t = useTranslations();
  const canManage = course.isOwner && course.canEdit;

  const {
    data: members = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: courseQueryKeys.members(course.id),
    queryFn: async (): Promise<SpaceMemberRead[]> =>
      (await sdk.spacesListMembers({ path: { space_id: course.id }, throwOnError: true })).data,
  });

  const requests = members.filter(member => member.status === MemberStatus.REQUESTED);
  const others = members.filter(member => member.status !== MemberStatus.REQUESTED);

  return (
    <div className="flex flex-col gap-6">
      {canManage && <InviteForm actions={actions} />}

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load_members')}>
        {requests.length > 0 && (
          <MemberSection title={t('courses.join_requests')}>
            {requests.map(member => (
              <MemberRow key={member.userId} member={member}>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      icon={Check}
                      tooltip={t('courses.approve')}
                      aria-label={t('courses.approve')}
                      onClick={() => actions.approveRequest.mutate(member.userId)}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      icon={X}
                      tooltip={t('courses.deny')}
                      aria-label={t('courses.deny')}
                      onClick={() => actions.removeMember.mutate(member.userId)}
                    />
                  </>
                )}
              </MemberRow>
            ))}
          </MemberSection>
        )}

        <MemberSection title={t('courses.members_count', { count: others.length })}>
          {others.map(member => (
            <MemberRow key={member.userId} member={member}>
              {canManage && member.role !== SpaceRole.OWNER && <MemberActions member={member} actions={actions} />}
            </MemberRow>
          ))}
        </MemberSection>
      </QueryState>
    </div>
  );
}

function InviteForm({ actions }: { actions: Actions }) {
  const t = useTranslations();
  const [identifier, setIdentifier] = useState('');

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return;
    actions.invite.mutate(value, { onSuccess: () => setIdentifier('') });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        value={identifier}
        onChange={e => setIdentifier(e.target.value)}
        placeholder={t('courses.invite_placeholder')}
        aria-label={t('courses.invite_placeholder')}
        maxLength={IDENTIFIER_MAX_LENGTH}
        className="max-w-sm"
      />
      <Button type="submit" icon={UserPlus} disabled={!identifier.trim()} loading={actions.invite.isPending}>
        {t('courses.invite')}
      </Button>
    </form>
  );
}

function MemberSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <h3 className="px-4 pt-4 pb-2 text-sm font-medium text-foreground">{title}</h3>
      <ul className="pb-2">{children}</ul>
    </section>
  );
}

function MemberRow({ member, children }: { member: SpaceMemberRead; children?: React.ReactNode }) {
  const t = useTranslations();
  const name = member.displayName || member.username;

  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">{name}</p>
        {member.displayName && <p className="truncate text-xs text-muted-foreground">@{member.username}</p>}
      </div>
      {member.status !== MemberStatus.ACTIVE && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t(MEMBER_STATUS_LABELS[member.status])}
        </span>
      )}
      {children}
    </li>
  );
}

/** Role select and remove. An invitation that is not accepted can only be cancelled. */
function MemberActions({ member, actions }: { member: SpaceMemberRead; actions: Actions }) {
  const t = useTranslations();
  const name = member.displayName || member.username;
  const isInvited = member.status === MemberStatus.INVITED;
  const removeLabel = t(isInvited ? 'courses.cancel_invitation' : 'courses.remove_member');
  // Controlled: the Tooltip around a tooltip button does not pass the trigger props through.
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  return (
    <>
      {!isInvited && (
        <NativeSelect
          value={member.role}
          aria-label={t('courses.role_label')}
          className="w-32"
          disabled={actions.setMemberRole.isPending}
          onChange={e =>
            actions.setMemberRole.mutate({
              userId: member.userId,
              // SAFETY: the only options are EDITOR and VIEWER.
              role: Number(e.target.value),
            })
          }
        >
          {[SpaceRole.EDITOR, SpaceRole.VIEWER].map(role => (
            <option key={role} value={role}>
              {t(ROLE_LABELS[role])}
            </option>
          ))}
        </NativeSelect>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        icon={X}
        tooltip={removeLabel}
        aria-label={removeLabel}
        onClick={() => setIsRemoveOpen(true)}
      />
      <ConfirmDialog
        open={isRemoveOpen}
        onOpenChange={setIsRemoveOpen}
        title={removeLabel}
        description={t(isInvited ? 'courses.cancel_invitation_description' : 'courses.remove_member_description', {
          name,
        })}
        confirmLabel={t('common.confirm')}
        onConfirm={() => actions.removeMember.mutate(member.userId)}
      />
    </>
  );
}
