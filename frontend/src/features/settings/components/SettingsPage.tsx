'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { AI_PERMISSIONS_QUERY_KEY, useAiToolPermissions } from '@/features/assist/hooks/useAiToolPermissions';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import {
  applyPermissionDraft,
  buildPermissionsPayload,
  buildSettingsPayload,
  DEFAULT_EASE_FACTOR,
  mergePermissionDraft,
  type PermissionDraft,
} from '../utils';

import { AiPermissionsSection } from './AiPermissionsSection';
import { AiSection } from './AiSection';
import { AppearanceSection } from './AppearanceSection';
import { LanguageSection } from './LanguageSection';
import { ProfileSection } from './ProfileSection';
import { SrsSection } from './SrsSection';

import type { SettingsForm } from '../types';

export function SettingsPage() {
  const t = useTranslations();
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<SettingsForm>(() => formFromUser(user));
  const [settingsDirty, setSettingsDirty] = useState(false);

  // The permission draft holds only the tools the user changed. Tools the user did not touch
  // always follow the server data, so a refetch (e.g. "Always allow" in the chat) never loses a change.
  const {
    data: serverPermissions,
    isLoading: isLoadingPermissions,
    isError: isPermissionsError,
  } = useAiToolPermissions();
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>({});
  const permissionsPayload = useMemo(
    () => buildPermissionsPayload(serverPermissions ?? [], permissionDraft),
    [serverPermissions, permissionDraft]
  );
  const permissions = useMemo(
    () => (serverPermissions ? applyPermissionDraft(serverPermissions, permissionDraft) : undefined),
    [serverPermissions, permissionDraft]
  );
  const dirty = settingsDirty || Object.keys(permissionsPayload).length > 0;

  const hasAnthropicKey = user?.hasAnthropicKey ?? false;
  const hasOpenaiKey = user?.hasOpenaiKey ?? false;

  const updateField = useCallback(<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSettingsDirty(true);
  }, []);

  const updatePermissions = useCallback(
    (changes: PermissionDraft) => {
      setPermissionDraft(prev => mergePermissionDraft(serverPermissions ?? [], prev, changes));
    },
    [serverPermissions]
  );

  const { mutate: saveSettings, isPending: isSaving } = useMutation({
    // Both requests run together. Each result is kept, so one failure does not hide the other success.
    mutationFn: async () => {
      const settingsPayload = buildSettingsPayload(form, user);
      const [settingsResult, permissionsResult] = await Promise.allSettled([
        Object.keys(settingsPayload).length === 0
          ? Promise.resolve(null)
          : sdk.usersUpdateMe({ body: settingsPayload }).then(res => res.data!),
        Object.keys(permissionsPayload).length === 0
          ? Promise.resolve(null)
          : sdk.usersUpdateAiToolPermissions({ body: { permissions: permissionsPayload } }).then(res => res.data ?? []),
      ]);
      return { settingsResult, permissionsResult };
    },
    onSuccess: ({ settingsResult, permissionsResult }) => {
      if (settingsResult.status === 'fulfilled') {
        const updatedUser: UserRead | null = settingsResult.value;
        if (updatedUser) {
          setUser(updatedUser);
          setForm(formFromUser(updatedUser));
          void queryClient.invalidateQueries({ queryKey: ['me'] });
        }
        setSettingsDirty(false);
      }

      if (permissionsResult.status === 'fulfilled') {
        // Show the saved values at once, so the switches do not jump back before the refetch ends.
        if (permissionsResult.value && permissionsResult.value.length > 0)
          queryClient.setQueryData(AI_PERMISSIONS_QUERY_KEY, permissionsResult.value);
        setPermissionDraft({});
        void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      }

      const isFailed = settingsResult.status === 'rejected' || permissionsResult.status === 'rejected';
      if (isFailed) toast.error(t('settings.failed_to_save'));
      else toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
  });

  const { mutate: removeKey, isPending: isRemovingKey } = useMutation({
    mutationFn: async (provider: 'anthropic' | 'openai') => {
      const payload: UserUpdate = provider === 'anthropic' ? { anthropicApiKey: null } : { openaiApiKey: null };
      const result = await sdk.usersUpdateMe({ body: payload });
      return result.data!;
    },
    onSuccess: (updatedUser: UserRead) => {
      setUser(updatedUser);
      setForm(formFromUser(updatedUser));
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl divide-y divide-border">
      <div className="pb-6">
        <ProfileSection user={user} form={form} updateField={updateField} />
      </div>
      <div className="py-6">
        <AiSection
          form={form}
          updateField={updateField}
          hasAnthropicKey={hasAnthropicKey}
          hasOpenaiKey={hasOpenaiKey}
          removeKey={removeKey}
          isRemovingKey={isRemovingKey}
        />
      </div>
      <div className="py-6">
        <AiPermissionsSection
          permissions={permissions}
          isLoading={isLoadingPermissions}
          isError={isPermissionsError}
          disabled={isSaving}
          onChange={updatePermissions}
        />
      </div>
      <div className="py-6">
        <AppearanceSection />
      </div>
      <div className="py-6">
        <LanguageSection />
      </div>
      <div className="py-6">
        <SrsSection form={form} updateField={updateField} />
      </div>

      <div className="flex justify-end pt-6">
        <Button onClick={() => saveSettings()} disabled={!dirty || isSaving} size="lg">
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function formFromUser(user: UserRead | null): SettingsForm {
  return {
    displayName: user?.displayName ?? '',
    aiProvider: user?.aiProvider ?? null,
    // API keys are write-only — the backend never echoes them back, so form starts blank
    anthropicApiKey: '',
    openaiApiKey: '',
    dailyReviewLimit: user?.dailyReviewLimit != null ? String(user.dailyReviewLimit) : '',
    initialEaseFactor: String(user?.initialEaseFactor ?? DEFAULT_EASE_FACTOR),
  };
}
