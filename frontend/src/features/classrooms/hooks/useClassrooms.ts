import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  type AiKeyStatusRead,
  type ClassroomSettingsRead,
  type ClassroomSettingsUpdate,
  type ClassroomTokenUsageRead,
  type DueSoonItem,
  type GradebookRead,
  type SpaceSummary,
} from '@/client';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

import { classSettingsErrorKey } from '../lib/classKey';
import { classroomQueryKeys, type MyClassroomsParams } from '../lib/queryKeys';

/** The classrooms the user owns or is an active member of. */
export function useMyClassrooms(params: MyClassroomsParams): UseQueryResult<SpaceSummary[]> {
  return useQuery({
    queryKey: classroomQueryKeys.mine(params),
    queryFn: async (): Promise<SpaceSummary[]> =>
      (await sdk.classroomsListMine({ query: params, throwOnError: true })).data,
    placeholderData: previous => previous,
  });
}

/** The next due items of a classroom (for students). */
export function useDueSoon(classroomId: string): UseQueryResult<DueSoonItem[]> {
  return useQuery({
    queryKey: classroomQueryKeys.dueSoon(classroomId),
    queryFn: async (): Promise<DueSoonItem[]> =>
      (await sdk.classroomsDueSoon({ path: { classroom_id: classroomId }, throwOnError: true })).data,
  });
}

/** The classroom settings that are not on the space row (feed permission, class key). Owner only. */
export function useClassroomSettings(classroomId: string): UseQueryResult<ClassroomSettingsRead> {
  return useQuery({
    queryKey: classroomQueryKeys.settings(classroomId),
    queryFn: async (): Promise<ClassroomSettingsRead> =>
      (await sdk.classroomsGetSettings({ path: { classroom_id: classroomId }, throwOnError: true })).data,
  });
}

export function useUpdateClassroomSettings(classroomId: string) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: ClassroomSettingsUpdate): Promise<ClassroomSettingsRead> =>
      (await sdk.classroomsUpdateSettings({ path: { classroom_id: classroomId }, body, throwOnError: true })).data,
    onSuccess: settings => {
      queryClient.setQueryData(classroomQueryKeys.settings(classroomId), settings);
      // The key, its priority and the cap change which key the students use.
      void queryClient.invalidateQueries({ queryKey: classroomQueryKeys.aiKeyStatus(classroomId) });
      toast.success(t('classrooms.settings_saved'));
    },
    onError: err => {
      const key = classSettingsErrorKey(getErrorDetail(err, ''));
      toast.error(key ? t(key) : getErrorDetail(err, t('classrooms.failed_to_save_settings')));
    },
  });
}

/** The students × tests matrix of a classroom. Teachers only (`enabled` keeps students from asking). */
export function useGradebook(classroomId: string, enabled = true): UseQueryResult<GradebookRead> {
  return useQuery({
    queryKey: classroomQueryKeys.gradebook(classroomId),
    queryFn: async (): Promise<GradebookRead> =>
      (await sdk.classroomsGradebook({ path: { classroom_id: classroomId }, throwOnError: true })).data,
    enabled,
  });
}

/** Which AI key the user would use in the classroom (none, own key or Class key). */
export function useAiKeyStatus(classroomId: string, enabled = true): UseQueryResult<AiKeyStatusRead> {
  return useQuery({
    queryKey: classroomQueryKeys.aiKeyStatus(classroomId),
    queryFn: async (): Promise<AiKeyStatusRead> =>
      (await sdk.classroomsAiKeyStatus({ path: { classroom_id: classroomId }, throwOnError: true })).data,
    enabled,
  });
}

/** AI spend per student of the month and in total. Owner only. */
export function useClassroomTokenUsage(classroomId: string): UseQueryResult<ClassroomTokenUsageRead> {
  return useQuery({
    queryKey: classroomQueryKeys.tokenUsage(classroomId),
    queryFn: async (): Promise<ClassroomTokenUsageRead> =>
      (await sdk.classroomsTokenUsage({ path: { classroom_id: classroomId }, throwOnError: true })).data,
  });
}
