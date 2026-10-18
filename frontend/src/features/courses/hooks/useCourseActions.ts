import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  MemberStatus,
  type SpaceDetail,
  type SpaceDraftOrder,
  type SpaceDuplicateRequest,
  type SpaceItemContent,
  type SpaceItemCopy,
  type SpaceItemCreate,
  type SpaceItemUpdate,
  type SpaceVariantCreate,
  type SpacePublishRequest,
  type SpaceRole,
  type SpaceUpdate,
} from '@/client';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
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
  /** Other queries the write changes. They are marked stale only (`refetchType: 'none'`). */
  markStale?: QueryKey[];
};

/**
 * One queue per course: TanStack runs mutations with the same `scope` one after the other.
 * Reorder sends the full order, so a delete that runs at the same time would make it fail,
 * and responses in the wrong order would put a deleted item back into the cache.
 */
const structureScope = (courseId: string) => ({ id: `course-structure-${courseId}` });

/** Every write that stays on the course page has this key, so the edit-mode header can show "Saving…". */
export const courseWriteKey = (courseId: string) => ['courses', 'write', courseId] as const;

/**
 * Every write on one course page. Most endpoints return the new `SpaceDetail`, which replaces the cache
 * (no refetch). The others invalidate the detail key, which also covers the member list.
 */
export function useCourseActions(courseId: string) {
  const path = { space_id: courseId };

  // ── Edit mode ────────────────────────────────────────────────────────────────

  const enterEditMode = useDetailMutation(
    courseId,
    async () => (await sdk.spacesEnterEditMode({ path, throwOnError: true })).data,
    { error: 'courses.failed_to_edit' }
  );
  const discardDraft = useDetailMutation(
    courseId,
    async () => (await sdk.spacesDiscardDraft({ path, throwOnError: true })).data,
    // The note pages of the course show the old content: publish changes the published notes,
    // discard deletes the draft twins.
    { success: 'courses.draft_discarded', error: 'courses.failed_to_discard', markStale: [fileQueryKeys.notes()] }
  );
  const publish = useDetailMutation(
    courseId,
    async (body: SpacePublishRequest) => (await sdk.spacesPublish({ path, body, throwOnError: true })).data,
    { success: 'courses.published', error: 'courses.failed_to_publish', markStale: [fileQueryKeys.notes()] }
  );
  const reorder = useDetailMutation(
    courseId,
    async (body: SpaceDraftOrder) => (await sdk.spacesReorderDraft({ path, body, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );

  // ── Sections and items ───────────────────────────────────────────────────────

  const addSection = useDetailMutation(
    courseId,
    async (title: string) => (await sdk.spacesAddSection({ path, body: { title }, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const renameSection = useDetailMutation(
    courseId,
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
    courseId,
    async (sectionId: string) =>
      (await sdk.spacesDeleteSection({ path: { ...path, section_id: sectionId }, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const deleteItem = useDetailMutation(
    courseId,
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
    // TEST items: `testId` picks the variant to edit (default: the first one).
    async (arg: string | { itemId: string; testId?: string }): Promise<SpaceItemContent> => {
      const { itemId, testId } = typeof arg === 'string' ? { itemId: arg, testId: undefined } : arg;
      return (
        await sdk.spacesMakeItemEditable({
          path: { ...path, item_id: itemId },
          query: { test_id: testId ?? null },
          throwOnError: true,
        })
      ).data;
    },
    { error: 'courses.failed_to_edit' }
  );

  // ── Test items: attempt policy and variants ──────────────────────────────────

  const updateItem = useDetailMutation(
    courseId,
    async ({ itemId, body }: { itemId: string; body: SpaceItemUpdate }) =>
      (await sdk.spacesUpdateItem({ path: { ...path, item_id: itemId }, body, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const addVariant = useInvalidatingMutation(
    courseId,
    async ({ itemId, body }: { itemId: string; body: SpaceVariantCreate }): Promise<SpaceItemContent> =>
      (await sdk.spacesAddVariant({ path: { ...path, item_id: itemId }, body, throwOnError: true })).data,
    { error: 'courses.failed_to_save' }
  );
  const reorderVariants = useDetailMutation(
    courseId,
    async ({ itemId, testIds }: { itemId: string; testIds: string[] }) =>
      (
        await sdk.spacesReorderVariants({
          path: { ...path, item_id: itemId },
          body: { testIds },
          throwOnError: true,
        })
      ).data,
    { error: 'courses.failed_to_save' }
  );
  const removeVariant = useDetailMutation(
    courseId,
    async ({ itemId, testId }: { itemId: string; testId: string }) =>
      (
        await sdk.spacesRemoveVariant({
          path: { ...path, item_id: itemId, test_id: testId },
          throwOnError: true,
        })
      ).data,
    { error: 'courses.failed_to_save' }
  );

  // ── The course ───────────────────────────────────────────────────────────────

  const updateCourse = useDetailMutation(
    courseId,
    async (body: SpaceUpdate) => (await sdk.spacesUpdate({ path, body, throwOnError: true })).data,
    { success: 'courses.saved', error: 'courses.failed_to_save' }
  );
  const archive = useDetailMutation(
    courseId,
    async () => (await sdk.spacesArchive({ path, throwOnError: true })).data,
    {
      success: 'courses.archived',
      error: 'courses.failed_to_save',
    }
  );
  const unarchive = useDetailMutation(
    courseId,
    async () => (await sdk.spacesUnarchive({ path, throwOnError: true })).data,
    {
      success: 'courses.unarchived',
      error: 'courses.failed_to_save',
    }
  );
  const regenerateJoinCode = useDetailMutation(
    courseId,
    async () => (await sdk.spacesRegenerateJoinCode({ path, throwOnError: true })).data,
    { success: 'courses.join_code_regenerated', error: 'courses.failed_to_save' }
  );
  const duplicate = useNavigatingMutation(
    async (body: SpaceDuplicateRequest) => (await sdk.spacesDuplicate({ path, body, throwOnError: true })).data,
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
  const join = useDetailMutation(courseId, async () => (await sdk.spacesJoin({ path, throwOnError: true })).data, {
    success: detail => (detail.myStatus === MemberStatus.REQUESTED ? 'courses.request_sent' : 'courses.joined'),
    error: 'courses.failed_to_join',
  });
  const acceptInvitation = useDetailMutation(
    courseId,
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

  // The course questions in Review is a personal setting of the member. The response is the new detail.
  const setIncludeInSrs = useDetailMutation(
    courseId,
    async (includeInSrs: boolean) =>
      (await sdk.spacesUpdateMembership({ path, body: { includeInSrs }, throwOnError: true })).data,
    {
      success: detail => (detail.includeInSrs ? 'courses.included_in_review' : 'courses.removed_from_review'),
      error: 'courses.failed_to_save',
      // The Review pool changes: the next Review page load must fetch again.
      markStale: [['review']],
    }
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
    updateItem,
    addVariant,
    reorderVariants,
    removeVariant,
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
    setIncludeInSrs,
    invite,
    approveRequest,
    setMemberRole,
    removeMember,
  };
}

function useDetailMutation<V>(courseId: string, fn: (vars: V) => Promise<SpaceDetail>, text: DetailMutationText) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    mutationKey: courseWriteKey(courseId),
    scope: structureScope(courseId),
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      text.markStale?.forEach(queryKey => void queryClient.invalidateQueries({ queryKey, refetchType: 'none' }));
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
    mutationKey: courseWriteKey(courseId),
    scope: structureScope(courseId),
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
