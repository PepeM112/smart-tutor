'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { AiProvider, type AiEffort, type AiEffortSettings } from '@/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/features/auth/store/authStore';

import { ANTHROPIC_MODELS, EFFORT_ACTION_LABEL_KEYS, EFFORT_LEVELS, EFFORT_MODELS, MODEL_LABEL_KEYS } from '../aiModel';
import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';

import { SettingsSection } from './SettingsSection';

type EffortAction = keyof AiEffortSettings;

type Props = {
  /** The provider shown in the form. No provider chosen yet means Anthropic, as in the backend. */
  provider: AiProvider | null;
};

/** Each control shows its change at once and saves after a delay, like the theme. They are not part of the form. */
export function AiModelSection({ provider }: Props) {
  const t = useTranslations();
  const user = useAuthStore(s => s.user);
  const modelId = useId();

  const saveUser = useDebouncedUpdateUser();

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
            <Select
              value={user.anthropicModel}
              onValueChange={value => {
                const model = ANTHROPIC_MODELS.find(candidate => String(candidate) === value);
                if (model) saveUser({ anthropicModel: model }, { field: 'anthropicModel' });
              }}
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
                onChange={level => saveUser({ aiEffort: { [action]: level } }, { field: `aiEffort.${action}` })}
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
      <Select
        value={value}
        disabled={disabled}
        onValueChange={next => {
          const level = EFFORT_LEVELS.find(candidate => String(candidate) === next);
          if (level) onChange(level);
        }}
      >
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
