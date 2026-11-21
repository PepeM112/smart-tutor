'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAiToolPermissions } from '@/features/assist/hooks/useAiToolPermissions';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { useSaveAiToolPermissions } from '../hooks/useSaveAiToolPermissions';
import { parseSettingsTab, SETTINGS_TABS } from '../utils';

import { AiModelSection } from './AiModelSection';
import { AiPermissionsSection } from './AiPermissionsSection';
import { AiSection } from './AiSection';
import { AppearanceSection } from './AppearanceSection';
import { LanguageSection } from './LanguageSection';
import { ProfileSection } from './ProfileSection';
import { SrsSection } from './SrsSection';

export function SettingsPage() {
  const t = useTranslations();
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const queryClient = useQueryClient();

  const { data: permissions, isLoading: isLoadingPermissions, isError: isPermissionsError } = useAiToolPermissions();
  const { mutate: saveAiToolPermissions } = useSaveAiToolPermissions();

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

  const { mutate: removeKey, isPending: isRemovingKey } = useMutation({
    mutationFn: async (provider: 'anthropic' | 'openai') => {
      const payload: UserUpdate = provider === 'anthropic' ? { anthropicApiKey: null } : { openaiApiKey: null };
      const result = await sdk.usersUpdateMe({ body: payload });
      return result.data!;
    },
    onSuccess: (updatedUser: UserRead) => {
      setUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.failed_to_save'));
    },
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl min-w-0">
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {SETTINGS_TABS.map(value => (
            <TabsTrigger key={value} value={value}>
              {t(`settings.tab_${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection user={user} />
        </TabsContent>
        <TabsContent value="ai" className="divide-y divide-border [&>*]:py-6 [&>:first-child]:pt-0">
          <AiSection
            aiProvider={user.aiProvider ?? null}
            anthropicModel={user.anthropicModel}
            hasAnthropicKey={hasAnthropicKey}
            hasOpenaiKey={hasOpenaiKey}
            removeKey={removeKey}
            isRemovingKey={isRemovingKey}
          />
          <AiModelSection provider={user.aiProvider ?? null} />
          <AiPermissionsSection
            permissions={permissions}
            isLoading={isLoadingPermissions}
            isError={isPermissionsError}
            onChange={saveAiToolPermissions}
          />
        </TabsContent>
        <TabsContent value="appearance" className="divide-y divide-border [&>*]:py-6 [&>:first-child]:pt-0">
          <AppearanceSection />
          <LanguageSection />
        </TabsContent>
        <TabsContent value="srs">
          <SrsSection user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
