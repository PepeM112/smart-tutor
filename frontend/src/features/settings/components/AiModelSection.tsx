'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';

import {
  AiProvider,
  type AiEffort,
  type AiEffortSettings,
  type AnthropicModel,
  type UserRead,
  type UserUpdate,
} from '@/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/features/auth/store/authStore';

import { ANTHROPIC_MODELS, EFFORT_ACTION_LABEL_KEYS, EFFORT_LEVELS, EFFORT_MODELS, MODEL_LABEL_KEYS } from '../aiModel';
import { useUpdateUser } from '../hooks/useUpdateUser';

import { SettingsSection } from './SettingsSection';

type EffortAction = keyof AiEffortSettings;
type EffortChange = { action: EffortAction; level: AiEffort };

type Props = {
  /** The provider shown in the form. No provider chosen yet means Anthropic, as in the backend. */
  provider: AiProvider | null;
};

/** Saves at once, like the theme: each change is its own request, so these controls are not part of the form. */
export function AiModelSection({ provider }: Props) {
  const t = useTranslations();
  const user = useAuthStore(s => s.user);
  const modelId = useId();

  // The last value the backend confirmed. A failed save goes back to it, unless a later change replaced it.
  const savedModel = useRef<AnthropicModel | undefined>(user?.anthropicModel);
  const savedEffort = useRef<AiEffortSettings | undefined>(user?.aiEffort);

  const { mutate: saveModel } = useUpdateUser({
    onMutate: ({ anthropicModel }) => anthropicModel && patchUser({ anthropicModel }),
    onSuccess: updatedUser => {
      savedModel.current = updatedUser.anthropicModel;
    },
    onError: ({ anthropicModel }) => {
      if (useAuthStore.getState().user?.anthropicModel === anthropicModel && savedModel.current) {
        patchUser({ anthropicModel: savedModel.current });
      }
    },
  });

  const { mutate: saveEffort } = useUpdateUser({
    onMutate: ({ aiEffort }) => changedEffort(aiEffort).forEach(({ action, level }) => patchEffort(action, level)),
    onSuccess: updatedUser => {
      savedEffort.current = updatedUser.aiEffort;
    },
    onError: ({ aiEffort }) =>
      changedEffort(aiEffort).forEach(({ action, level }) => {
        const saved = savedEffort.current?.[action];
        if (useAuthStore.getState().user?.aiEffort[action] === level && saved) patchEffort(action, saved);
      }),
  });

  if (!user) return null;

  const isAnthropic = provider !== AiProvider.OPENAI;
  const effortDisabledKey = !isAnthropic
    ? 'settings.ai_effort_disabled_openai'
    : !EFFORT_MODELS.has(user.anthropicModel)
      ? 'settings.ai_effort_disabled_model'
      : null;

  return (
    <SettingsSection title={t('settings.ai_model_title')}>
      <div className="space-y-4">
        {isAnthropic && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={modelId}>{t('settings.ai_model')}</Label>
            {/* SAFETY: the items are built from ANTHROPIC_MODELS, so the value is one of them */}
            <Select
              value={user.anthropicModel}
              onValueChange={value => saveModel({ anthropicModel: value as AnthropicModel })}
            >
              <SelectTrigger id={modelId} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANTHROPIC_MODELS.map(model => (
                  <SelectItem key={model} value={model}>
                    {t(MODEL_LABEL_KEYS[model])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">{t('settings.ai_effort')}</h3>
          {effortDisabledKey && <p className="text-xs text-muted-foreground">{t(effortDisabledKey)}</p>}
          <ul className="divide-y divide-hairline border-y border-hairline">
            {/* SAFETY: the record is typed Record<EffortAction, string>, so its keys are exactly EffortAction */}
            {(Object.keys(EFFORT_ACTION_LABEL_KEYS) as EffortAction[]).map(action => (
              <EffortRow
                key={action}
                label={t(EFFORT_ACTION_LABEL_KEYS[action])}
                value={user.aiEffort[action]}
                disabled={effortDisabledKey !== null}
                onChange={level => saveEffort({ aiEffort: { [action]: level } })}
              />
            ))}
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
}

type EffortRowProps = {
  label: string;
  value: AiEffort;
  disabled: boolean;
  onChange: (level: AiEffort) => void;
};

function EffortRow({ label, value, disabled, onChange }: EffortRowProps) {
  const t = useTranslations();

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="min-w-0 text-sm text-foreground">{label}</span>
      {/* SAFETY: the items are built from EFFORT_LEVELS, so the value is one of them */}
      <Select value={value} disabled={disabled} onValueChange={next => onChange(next as AiEffort)}>
        <SelectTrigger aria-label={t('settings.ai_effort_select', { action: label })} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EFFORT_LEVELS.map(level => (
            <SelectItem key={level} value={level}>
              {t(`settings.ai_effort_level_${level}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}

/** Shows a change in the store before the backend answers. */
function patchUser(changes: Partial<UserRead>): void {
  const { user, setUser } = useAuthStore.getState();
  if (user) setUser({ ...user, ...changes });
}

/** The request carries one action, so this is the single changed level (or none). */
function changedEffort(aiEffort: UserUpdate['aiEffort']): EffortChange[] {
  // SAFETY: the keys of AiEffortUpdate are the same as the keys of AiEffortSettings
  return Object.entries(aiEffort ?? {}).flatMap(([action, level]) =>
    level ? [{ action: action as EffortAction, level }] : []
  );
}

function patchEffort(action: EffortAction, level: AiEffort): void {
  const user = useAuthStore.getState().user;
  if (user) patchUser({ aiEffort: { ...user.aiEffort, [action]: level } });
}
