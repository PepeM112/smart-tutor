'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { buildSettingsPayload, DEFAULT_EASE_FACTOR } from '../utils';

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
  const [dirty, setDirty] = useState(false);

  const hasAnthropicKey = user?.hasAnthropicKey ?? false;
  const hasOpenaiKey = user?.hasOpenaiKey ?? false;

  const updateField = useCallback(<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const { mutate: saveSettings, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const payload = buildSettingsPayload(form, user);

      if (Object.keys(payload).length === 0) return null;

      const result = await sdk.usersUpdateMe({ body: payload });
      return result.data!;
    },
    onSuccess: (updatedUser: UserRead | null) => {
      if (!updatedUser) {
        setDirty(false);
        return;
      }
      setUser(updatedUser);
      setForm(formFromUser(updatedUser));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
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
