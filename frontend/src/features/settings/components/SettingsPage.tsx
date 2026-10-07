'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { usePermissionDraft } from '../hooks/usePermissionDraft';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { buildSettingsPayload, DEFAULT_EASE_FACTOR, getDirtyTabs, parseSettingsTab, SETTINGS_TABS } from '../utils';

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
  // Derived from the form, so a value changed and then changed back does not count as a change.
  const settingsPayload = useMemo(() => buildSettingsPayload(form, user), [form, user]);

  const permissionDraft = usePermissionDraft();
  const dirty = Object.keys(settingsPayload).length > 0 || Object.keys(permissionDraft.payload).length > 0;

  const dirtyTabs = useMemo(
    () => getDirtyTabs(settingsPayload, permissionDraft.payload),
    [settingsPayload, permissionDraft.payload]
  );

  // The tab is in the URL, so a link can open a tab. `replace` adds no history entry per click.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseSettingsTab(searchParams.get('tab'));
  const changeTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const hasAnthropicKey = user?.hasAnthropicKey ?? false;
  const hasOpenaiKey = user?.hasOpenaiKey ?? false;

  const updateField = useCallback(<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const { saveSettings, isSaving } = useSettingsSave({
    settingsPayload,
    permissionsPayload: permissionDraft.payload,
    onUserSaved: updatedUser => {
      setUser(updatedUser);
      setForm(formFromUser(updatedUser));
    },
    onPermissionsSaved: permissionDraft.reset,
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
    // While the save runs, the form is read-only: a change made then is not in the request, and the
    // response would overwrite it. A disabled `fieldset` disables every control inside it.
    <fieldset disabled={isSaving} className="mx-auto max-w-2xl min-w-0">
      {/* All state lives here, not in the panels. A panel that is not active unmounts, and the draft stays. */}
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {SETTINGS_TABS.map(value => (
            <TabsTrigger key={value} value={value}>
              {t(`settings.tab_${value}`)}
              {dirtyTabs.has(value) && (
                <span
                  role="img"
                  aria-label={t('settings.unsaved_changes')}
                  className="size-1.5 rounded-full bg-primary"
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection user={user} form={form} updateField={updateField} />
        </TabsContent>
        <TabsContent value="ai" className="divide-y divide-border [&>*]:py-6 [&>:first-child]:pt-0">
          <AiSection
            form={form}
            updateField={updateField}
            hasAnthropicKey={hasAnthropicKey}
            hasOpenaiKey={hasOpenaiKey}
            removeKey={removeKey}
            isRemovingKey={isRemovingKey}
          />
          <AiPermissionsSection
            permissions={permissionDraft.permissions}
            isLoading={permissionDraft.isLoading}
            isError={permissionDraft.isError}
            disabled={isSaving}
            onChange={permissionDraft.change}
          />
        </TabsContent>
        <TabsContent value="appearance" className="divide-y divide-border [&>*]:py-6 [&>:first-child]:pt-0">
          <AppearanceSection />
          <LanguageSection />
        </TabsContent>
        <TabsContent value="srs">
          <SrsSection form={form} updateField={updateField} />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end border-t border-border mt-8 pt-6">
        <Button onClick={() => saveSettings()} disabled={!dirty || isSaving} size="lg">
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </fieldset>
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
