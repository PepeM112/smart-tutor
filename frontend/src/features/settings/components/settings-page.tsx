'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type UserRead, type UserUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { sdk } from '@/lib/api-client';

import { AiSection } from './ai-section';
import { AppearanceSection } from './appearance-section';
import { LanguageSection } from './language-section';
import { ProfileSection } from './profile-section';
import { SrsSection } from './srs-section';

import type { SettingsForm } from '../types';

export function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
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
      const payload: UserUpdate = {};

      if (form.displayName !== (user?.displayName ?? '')) {
        payload.displayName = form.displayName || null;
      }

      if (form.aiProvider !== (user?.aiProvider ?? null)) {
        payload.aiProvider = form.aiProvider;
      }

      if (form.anthropicApiKey) {
        payload.anthropicApiKey = form.anthropicApiKey;
      }

      if (form.openaiApiKey) {
        payload.openaiApiKey = form.openaiApiKey;
      }

      const limit = form.dailyReviewLimit ? parseInt(form.dailyReviewLimit, 10) : null;
      if (limit !== (user?.dailyReviewLimit ?? null)) {
        payload.dailyReviewLimit = limit;
      }

      const ease = parseFloat(form.initialEaseFactor);
      if (!isNaN(ease) && ease !== (user?.initialEaseFactor ?? 2.5)) {
        payload.initialEaseFactor = ease;
      }

      if (Object.keys(payload).length === 0) return user!;

      const result = await sdk.usersUpdateMe({ body: payload });
      return result.data!;
    },
    onSuccess: (updatedUser: UserRead) => {
      setUser(updatedUser);
      setForm(formFromUser(updatedUser));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings_saved'));
    },
    onError: () => {
      toast.error(t('failed_to_save'));
    },
  });

  const { mutate: removeKey } = useMutation({
    mutationFn: async (provider: 'anthropic' | 'openai') => {
      const payload: UserUpdate = provider === 'anthropic' ? { anthropicApiKey: null } : { openaiApiKey: null };
      const result = await sdk.usersUpdateMe({ body: payload });
      return result.data!;
    },
    onSuccess: (updatedUser: UserRead) => {
      setUser(updatedUser);
      setForm(formFromUser(updatedUser));
      toast.success(t('settings_saved'));
    },
    onError: () => {
      toast.error(t('failed_to_save'));
    },
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ProfileSection user={user} form={form} updateField={updateField} />
      <AiSection
        form={form}
        updateField={updateField}
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
        removeKey={removeKey}
      />
      <AppearanceSection />
      <LanguageSection />
      <SrsSection form={form} updateField={updateField} />

      <div className="flex justify-end">
        <Button onClick={() => saveSettings()} disabled={!dirty || isSaving} size="lg">
          {isSaving ? tc('saving') : tc('save')}
        </Button>
      </div>
    </div>
  );
}

function formFromUser(user: UserRead | null): SettingsForm {
  return {
    displayName: user?.displayName ?? '',
    aiProvider: user?.aiProvider ?? null,
    anthropicApiKey: '',
    openaiApiKey: '',
    dailyReviewLimit: user?.dailyReviewLimit != null ? String(user.dailyReviewLimit) : '',
    initialEaseFactor: String(user?.initialEaseFactor ?? 2.5),
  };
}
