'use client';

import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AiProvider, type AnthropicModel, type UserUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { MODEL_LABEL_KEYS } from '../aiModel';
import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';
import { useUpdateUser } from '../hooks/useUpdateUser';

import { SettingsSection } from './SettingsSection';

type Props = {
  aiProvider: AiProvider | null;
  anthropicModel: AnthropicModel;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
};

const PROVIDERS = [
  { value: AiProvider.ANTHROPIC, labelKey: 'settings.anthropic' },
  { value: AiProvider.OPENAI, labelKey: 'settings.openai' },
] as const;

type KeyProvider = 'anthropic' | 'openai';

const KEY_FIELDS: Record<KeyProvider, { id: string; labelKey: string; toPayload: (key: string | null) => UserUpdate }> =
  {
    anthropic: {
      id: 'anthropicKey',
      labelKey: 'settings.anthropic_api_key',
      toPayload: key => ({ anthropicApiKey: key }),
    },
    openai: { id: 'openaiKey', labelKey: 'settings.openai_api_key', toPayload: key => ({ openaiApiKey: key }) },
  };

export function AiSection({ aiProvider, anthropicModel, hasAnthropicKey, hasOpenaiKey }: Props) {
  const t = useTranslations();
  const saveUser = useDebouncedUpdateUser();

  return (
    <SettingsSection title={t('settings.ai_configuration')} description={t('settings.ai_description')}>
      <div className="space-y-5">
        {/* Provider selector */}
        <div className="space-y-2">
          <Label>{t('settings.ai_provider')}</Label>
          <div className="flex gap-2">
            {PROVIDERS.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => value !== aiProvider && saveUser({ aiProvider: value }, { field: 'aiProvider' })}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-lg border px-4 py-2.5 text-sm transition-colors',
                  aiProvider === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="font-medium">{t(labelKey)}</span>
                <span className="text-xs opacity-70">
                  {t(value === AiProvider.ANTHROPIC ? MODEL_LABEL_KEYS[anthropicModel] : 'settings.model_gpt4o_mini')}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ApiKeyField provider="anthropic" hasKey={hasAnthropicKey} />
        <ApiKeyField provider="openai" hasKey={hasOpenaiKey} />
      </div>
    </SettingsSection>
  );
}

type ApiKeyFieldProps = {
  provider: KeyProvider;
  hasKey: boolean;
};

function ApiKeyField({ provider, hasKey }: ApiKeyFieldProps) {
  const t = useTranslations();
  const { id, labelKey, toPayload } = KEY_FIELDS[provider];
  // The backend never returns a key, so the field starts blank. A half-typed secret is saved only by the button.
  const [apiKey, setApiKey] = useState('');
  const [isShown, setIsShown] = useState(false);
  const { mutate: updateKey, isPending: isUpdatingKey } = useUpdateUser();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{t(labelKey)}</Label>
        {hasKey && (
          <span className="flex items-center gap-1 text-xs text-feedback-correct">
            <Check className="size-3" />
            {t('settings.api_key_configured')}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={isShown ? 'text' : 'password'}
            placeholder={hasKey ? '••••••••••••••••' : t('settings.api_key_placeholder')}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
            className={apiKey ? 'pr-10' : undefined}
          />
          {apiKey && (
            <button
              type="button"
              onClick={() => setIsShown(shown => !shown)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={isShown ? t('settings.hide_key') : t('settings.show_key')}
            >
              {isShown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          )}
        </div>
        <Button
          size="sm"
          disabled={!apiKey || isUpdatingKey}
          onClick={() => updateKey(toPayload(apiKey), { onSuccess: () => setApiKey('') })}
        >
          {t('settings.save_key')}
        </Button>
        {hasKey && (
          <ConfirmDialog
            trigger={
              <Button
                variant="destructive"
                size="icon-sm"
                tooltip={t('settings.remove_key')}
                disabled={isUpdatingKey}
                aria-label={t('settings.remove_key')}
              >
                <X className="size-3.5" />
              </Button>
            }
            title={t('settings.remove_key_title')}
            description={t('settings.remove_key_confirm')}
            confirmLabel={t('settings.remove_key')}
            confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onConfirm={() => updateKey(toPayload(null))}
          />
        )}
      </div>
    </div>
  );
}
