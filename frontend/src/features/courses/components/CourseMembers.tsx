'use client';

import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Check, Eye, PenLine, UserMinus, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MemberStatus, SpaceKind, SpaceRole, type SpaceDetail, type SpaceMemberRead } from '@/client';
import { DataTableV2, type MobileAction } from '@/components/shared/DataTableV2';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/apiClient';
import { formatShortDate } from '@/lib/format';

import { type useCourseActions } from '../hooks/useCourseActions';
import { MEMBER_STATUS_LABELS, ROLE_ICONS, roleLabelKey } from '../lib/labels';
import { courseQueryKeys } from '../lib/queryKeys';

import { InviteUserDialog } from './InviteUserDialog';

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
};

/** Join requests first: they wait for the owner. Then invitations, then active members. */
const STATUS_ORDER: Record<MemberStatus, number> = {
  [MemberStatus.REQUESTED]: 0,
  [MemberStatus.INVITED]: 1,
  [MemberStatus.ACTIVE]: 2,
};

/**
 * The member table. Authors can read it. In a course only the owner can invite, approve, change roles and remove.
 * In a classroom a co-teacher also invites and approves students and removes students; only the owner
 * changes roles and removes co-teachers.
 * No emails and no progress per member (a standalone course shows no data about one user).
 */
export function CourseMembers({ course, actions }: Props) {
  const t = useTranslations();
  // Invite, approve and role changes need an active course. The owner can still remove members
  // (and deny requests, cancel invitations) in an archived course: the backend allows it.
  const isClassroom = course.kind === SpaceKind.CLASSROOM;
  const canManage = isClassroom ? course.canEdit : course.isOwner && course.canEdit;
  const canSetRole = course.isOwner && course.canEdit;
  const canRemoveAny = isClassroom ? course.isOwner || course.canEdit : course.isOwner;
  // A co-teacher can not remove another co-teacher.
  const canRemove = (member: SpaceMemberRead): boolean =>
    canRemoveAny && (course.isOwner || member.role !== SpaceRole.EDITOR);
  // One write at a time: a double click would send a second call that gets a 409 / 404.
  const isBusy = actions.approveRequest.isPending || actions.removeMember.isPending || actions.setMemberRole.isPending;

  const {
    data: members = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: courseQueryKeys.members(course.id),
    queryFn: async (): Promise<SpaceMemberRead[]> =>
      (await sdk.spacesListMembers({ path: { space_id: course.id }, throwOnError: true })).data,
  });

  const sorted = members.toSorted((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const columns = useMemberColumns(isClassroom);

  const renderActions = (member: SpaceMemberRead): MobileAction[][] =>
    memberActions(member, {
      canManage,
      canSetRole,
      canRemove: canRemove(member),
      isClassroom,
      isBusy,
      actions,
      t: (key, values) => t(key, values),
    });
  // The list also holds requests and invitations: the count is for active members only.
  const activeCount = members.filter(member => member.status === MemberStatus.ACTIVE).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {/* No count while the list loads or fails: `members` is empty then, and "0 members" would be wrong. */}
        {!isLoading && !isError && (
          <h2 className="text-sm font-medium text-foreground">{t('courses.members_count', { count: activeCount })}</h2>
        )}
        {canManage && (
          <div className="ml-auto">
            <InviteButton actions={actions} />
          </div>
        )}
      </div>

      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('courses.failed_to_load_members')}>
        <DataTableV2
          columns={columns}
          data={sorted}
          getRowId={member => member.userId}
          emptyMessage={t('courses.no_members')}
          renderPreview={member => <MemberName member={member} />}
          renderActions={canRemoveAny || canManage ? renderActions : undefined}
        />
      </QueryState>
    </div>
  );
}

function InviteButton({ actions }: { actions: Actions }) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" icon={UserPlus} onClick={() => setIsOpen(true)}>
        {t('courses.invite')}
      </Button>
      <InviteUserDialog open={isOpen} onOpenChange={setIsOpen} actions={actions} />
    </>
  );
}

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * The owner's menu for one row.
 * A request: approve / deny. An invitation: cancel. An active member: change the role / remove.
 */
function memberActions(
  member: SpaceMemberRead,
  {
    canManage,
    canSetRole,
    canRemove,
    isClassroom,
    isBusy,
    actions,
    t,
  }: {
    canManage: boolean;
    canSetRole: boolean;
    canRemove: boolean;
    isClassroom: boolean;
    isBusy: boolean;
    actions: Actions;
    t: Translate;
  }
): MobileAction[][] {
  const name = member.displayName || member.username;
  const remove = (label: string, description: string, icon = UserMinus): MobileAction => ({
    label,
    icon,
    variant: 'destructive',
    disabled: isBusy,
    onClick: () => actions.removeMember.mutate(member.userId),
    confirm: { title: label, description },
  });

  if (member.status === MemberStatus.REQUESTED) {
    const approve: MobileAction = {
      label: t('courses.approve'),
      icon: Check,
      disabled: isBusy,
      onClick: () => actions.approveRequest.mutate(member.userId),
    };
    // Deny has no confirm: the user can send a new request.
    const deny: MobileAction = {
      label: t('courses.deny'),
      icon: X,
      variant: 'destructive',
      disabled: isBusy,
      onClick: () => actions.removeMember.mutate(member.userId),
    };
    // Denying a request is a removal: the same rule applies.
    return canManage ? [[approve], [deny]] : canRemove ? [[deny]] : [];
  }

  if (member.status === MemberStatus.INVITED) {
    if (!canRemove) return [];
    return [[remove(t('courses.cancel_invitation'), t('courses.cancel_invitation_description', { name }), X)]];
  }

  const removeGroup = canRemove
    ? [remove(t('courses.remove_member'), t('courses.remove_member_description', { name }))]
    : [];
  if (!canSetRole) return removeGroup.length > 0 ? [removeGroup] : [];

  const nextRole = member.role === SpaceRole.EDITOR ? SpaceRole.VIEWER : SpaceRole.EDITOR;
  const changeRole: MobileAction = {
    label: t(
      nextRole === SpaceRole.EDITOR
        ? isClassroom
          ? 'classrooms.make_co_teacher'
          : 'courses.make_editor'
        : isClassroom
          ? 'classrooms.make_student'
          : 'courses.make_viewer'
    ),
    icon: nextRole === SpaceRole.EDITOR ? PenLine : Eye,
    disabled: isBusy,
    onClick: () => actions.setMemberRole.mutate({ userId: member.userId, role: nextRole }),
  };
  return removeGroup.length > 0 ? [[changeRole], removeGroup] : [[changeRole]];
}

function useMemberColumns(isClassroom: boolean): ColumnDef<SpaceMemberRead, unknown>[] {
  const t = useTranslations();

  return [
    {
      id: 'name',
      header: t('courses.column_name'),
      meta: { hideOnMobile: true, grow: true },
      cell: ({ row }) => <MemberName member={row.original} />,
    },
    {
      id: 'role',
      header: t('courses.role_label'),
      meta: { widthClass: 'w-28' },
      cell: ({ row }) => {
        const Icon = ROLE_ICONS[row.original.role];
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className="size-3.5" />
            {t(roleLabelKey(row.original.role, isClassroom))}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('courses.column_status'),
      meta: { widthClass: 'w-28' },
      cell: ({ row }) => <MemberStatusBadge status={row.original.status} />,
    },
    {
      id: 'joined',
      header: t('courses.column_joined'),
      meta: { widthClass: 'w-24 text-right' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.joinedAt ? formatShortDate(row.original.joinedAt) : '—'}
        </span>
      ),
    },
  ];
}

function MemberName({ member }: { member: SpaceMemberRead }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{member.displayName || member.username}</p>
      <p className="truncate text-xs text-muted-foreground">@{member.username}</p>
    </div>
  );
}

function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const t = useTranslations();
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {t(MEMBER_STATUS_LABELS[status])}
    </span>
  );
}
