import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  MemberStatus,
  type SpaceDetail,
  type SpaceDraftOrder,
  type SpaceItemContent,
  type SpaceItemCopy,
  type SpaceItemCreate,
  type SpacePublishRequest,
  type SpaceRole,
  type SpaceUpdate,
} from '@/client';
import { sdk } from '@/lib/apiClient';
import { courseHref, Routes } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { applyCourseDetail, courseQueryKeys } from '../lib/queryKeys';

type MutationText = {
  /** Translation key of the success toast. Leave it out for a silent success. */
  success?: string;
  /** Translation key of the fallback error toast (the backend `detail` wins when it has one). */
  error: string;
};

type DetailMutationText = Omit<MutationText, 'success'> & {
  /** A key, or a function that picks the key from the new detail. */
  success?: string | ((detail: SpaceDetail) => string);
};

function useDetailMutation<V>(fn: (vars: V) => Promise<SpaceDetail>, text: DetailMutationText) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      const success = typeof text.success === 'function' ? text.success(detail) : text.success;
      if (success) toast.success(t(success));
    },
    onError: err => toast.error(getErrorDetail(err, t(text.error))),
  });
}

function useInvalidatingMutation<V, R>(courseId: string, fn: (vars: V) => Promise<R>, text: MutationText) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      // The detail key is a prefix of the member list key: both refetch.
      void queryClient.invalidateQueries({ queryKey: courseQueryKeys.detail(courseId) });
      if (text.success) toast.success(t(text.success));
    },
    onError: err => toast.error(getErrorDetail(err, t(text.error))),
  });
}

/**
 * For writes after which the user leaves the page (leave, decline, delete, duplicate).
 * The course queries are only marked stale (`refetchType: 'none'`): a refetch of this page
 * while it unmounts would get a 403 / 404.
 */
function useNavigatingMutation<V, R>(fn: (vars: V) => Promise<R>, href: (result: R) => string, text: MutationText) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: result => {
      router.push(href(result));
      void queryClient.invalidateQueries({ queryKey: courseQueryKeys.all(), refetchType: 'none' });
      if (text.success) toast.success(t(text.success));
    },
    onError: err => toast.error(getErrorDetail(err, t(text.error))),
  });
}

/**
 * Every write on one course page. Most endpoints return the new `SpaceDetail`, which replaces the cache
 * (no refetch). The others invalidate the detail key, which also covers the member list.
 */
export function useCourseActions(courseId: string) {
  const path = { space_id: courseId };

  // ── Edit mode ────────────────────────────────────────────────────────────────

  const enterEditMode = useDetailMutation(
    async () => (await sdk.spacesEnterEditMode({ path, throwOnError: true })).data,
    { error: 'courses.failed_to_edit' }
  );
  const discardDraft = useDetailMutation(
    async () => (await sdk.spacesDiscardDraft({ path, throwOnError: true })).data,
    { success: 'courses.draft_discarded', error: 'courses.failed_to_discard' }
  );
  const publish = useDetailMutation(
    async (body: SpacePublishRequest) => (await sdk.spacesPublish({ path, body, throwOnError: true })).data,
    { success: 'courses.published', error: 'courses.failed_to_publish' }
  );
  const reorder = useDetailMutation(
    async (body: SpaceDraftOrder) => (await sdk.spacesReorderDraft({ path, body, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );

  // ── Sections and items ───────────────────────────────────────────────────────

  const addSection = useDetailMutation(
    async (title: string) => (await sdk.spacesAddSection({ path, body: { title }, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const renameSection = useDetailMutation(
    async ({ sectionId, title }: { sectionId: string; title: string }) =>
      (
        await sdk.spacesRenameSection({
          path: { ...path, section_id: sectionId },
          body: { title },
          throwOnError: true,
        })
      ).data,
    { error: 'courses.failed_to_save' }
  );
  const deleteSection = useDetailMutation(
    async (sectionId: string) =>
      (await sdk.spacesDeleteSection({ path: { ...path, section_id: sectionId }, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const deleteItem = useDetailMutation(
    async (itemId: string) =>
      (await sdk.spacesDeleteItem({ path: { ...path, item_id: itemId }, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const createItem = useInvalidatingMutation(
    courseId,
    async (body: SpaceItemCreate): Promise<SpaceItemContent> =>
      (await sdk.spacesCreateItem({ path, body, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const copyItem = useInvalidatingMutation(
    courseId,
    async (body: SpaceItemCopy): Promise<SpaceItemContent> =>
      (await sdk.spacesCopyItem({ path, body, throwOnError: true })).data,
    { success: 'courses.item_copied', error: 'courses.failed_to_copy_item' }
  );
  // The twin is a new draft row: the detail must show `hasChanges` for the item.
  const makeEditable = useInvalidatingMutation(
    courseId,
    async (itemId: string): Promise<SpaceItemContent> =>
      (await sdk.spacesMakeItemEditable({ path: { ...path, item_id: itemId }, throwOnError: true })).data,
    { error: 'courses.failed_to_edit' }
  );

  // ── The course ───────────────────────────────────────────────────────────────

  const updateCourse = useDetailMutation(
    async (body: SpaceUpdate) => (await sdk.spacesUpdate({ path, body, throwOnError: true })).data,
    { success: 'courses.saved', error: 'courses.failed_to_save' }
  );
  const archive = useDetailMutation(async () => (await sdk.spacesArchive({ path, throwOnError: true })).data, {
    success: 'courses.archived',
    error: 'courses.failed_to_save',
  });
  const unarchive = useDetailMutation(async () => (await sdk.spacesUnarchive({ path, throwOnError: true })).data, {
    success: 'courses.unarchived',
    error: 'courses.failed_to_save',
  });
  const regenerateJoinCode = useDetailMutation(
    async () => (await sdk.spacesRegenerateJoinCode({ path, throwOnError: true })).data,
    { success: 'courses.join_code_regenerated', error: 'courses.failed_to_save' }
  );
  const duplicate = useNavigatingMutation(
    async () => (await sdk.spacesDuplicate({ path, throwOnError: true })).data,
    detail => courseHref(detail),
    { success: 'courses.duplicated', error: 'courses.failed_to_duplicate' }
  );
  const deleteForever = useNavigatingMutation(
    async (title: string) => sdk.spacesDeleteForever({ path, body: { title }, throwOnError: true }),
    () => Routes.COURSES,
    { success: 'courses.deleted', error: 'courses.failed_to_delete' }
  );

  // ── Membership of the current user ──────────────────────────────────────────

  // A PRIVATE course gives a request, not a membership.
  const join = useDetailMutation(async () => (await sdk.spacesJoin({ path, throwOnError: true })).data, {
    success: detail => (detail.myStatus === MemberStatus.REQUESTED ? 'courses.request_sent' : 'courses.joined'),
    error: 'courses.failed_to_join',
  });
  const acceptInvitation = useDetailMutation(
    async () => (await sdk.spacesAcceptInvitation({ path, throwOnError: true })).data,
    { success: 'courses.joined', error: 'courses.failed_to_join' }
  );
  const declineInvitation = useNavigatingMutation(
    async () => sdk.spacesDeclineInvitation({ path, throwOnError: true }),
    () => Routes.COURSES,
    { success: 'courses.invitation_declined', error: 'courses.failed_to_save' }
  );
  // Also cancels a pending join request.
  const leave = useNavigatingMutation(
    async () => sdk.spacesLeave({ path, throwOnError: true }),
    () => Routes.COURSES,
    { success: 'courses.left', error: 'courses.failed_to_leave' }
  );

  // ── Members (owner) ──────────────────────────────────────────────────────────

  const invite = useInvalidatingMutation(
    courseId,
    async (identifier: string) => sdk.spacesInvite({ path, body: { identifier }, throwOnError: true }),
    { success: 'courses.invited', error: 'courses.failed_to_invite' }
  );
  const approveRequest = useInvalidatingMutation(
    courseId,
    async (userId: string) => sdk.spacesApproveRequest({ path: { ...path, user_id: userId }, throwOnError: true }),
    { success: 'courses.request_approved', error: 'courses.failed_to_save' }
  );
  const setMemberRole = useInvalidatingMutation(
    courseId,
    async ({ userId, role }: { userId: string; role: SpaceRole.EDITOR | SpaceRole.VIEWER }) =>
      sdk.spacesSetMemberRole({ path: { ...path, user_id: userId }, body: { role }, throwOnError: true }),
    { success: 'courses.role_changed', error: 'courses.failed_to_save' }
  );
  const removeMember = useInvalidatingMutation(
    courseId,
    async (userId: string) => sdk.spacesRemoveMember({ path: { ...path, user_id: userId }, throwOnError: true }),
    { success: 'courses.member_removed', error: 'courses.failed_to_save' }
  );

  return {
    enterEditMode,
    discardDraft,
    publish,
    reorder,
    addSection,
    renameSection,
    deleteSection,
    deleteItem,
    createItem,
    copyItem,
    makeEditable,
    updateCourse,
    archive,
    unarchive,
    regenerateJoinCode,
    duplicate,
    deleteForever,
    join,
    acceptInvitation,
    declineInvitation,
    leave,
    invite,
    approveRequest,
    setMemberRole,
    removeMember,
  };
}
