'use client';

import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AiProvider } from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { SettingsForm, UpdateField } from '../types';

type Props = {
  form: Pick<SettingsForm, 'aiProvider' | 'anthropicApiKey' | 'openaiApiKey'>;
  updateField: UpdateField;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  removeKey: (provider: 'anthropic' | 'openai') => void;
};

const PROVIDERS = [
  { value: AiProvider.ANTHROPIC, labelKey: 'anthropic', modelKey: 'model_claude_haiku' },
  { value: AiProvider.OPENAI, labelKey: 'openai', modelKey: 'model_gpt4o_mini' },
] as const;

export function AiSection({ form, updateField, hasAnthropicKey, hasOpenaiKey, removeKey }: Props) {
  const t = useTranslations('settings');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ai_configuration')}</CardTitle>
        <CardDescription>{t('ai_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Provider selector */}
        <div className="space-y-2">
          <Label>{t('ai_provider')}</Label>
          <div className="flex gap-2">
            {PROVIDERS.map(({ value, labelKey, modelKey }) => (
              <button
                key={value}
                onClick={() => updateField('aiProvider', value)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-lg border px-4 py-2.5 text-sm transition-colors',
                  form.aiProvider === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span className="font-medium">{t(labelKey)}</span>
                <span className="text-xs opacity-70">{t(modelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Anthropic API Key */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="anthropicKey">{t('anthropic_api_key')}</Label>
            {hasAnthropicKey && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" />
                {t('api_key_configured')}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="anthropicKey"
                type={showAnthropicKey ? 'text' : 'password'}
                placeholder={hasAnthropicKey ? '••••••••••••••••' : t('api_key_placeholder')}
                value={form.anthropicApiKey}
                onChange={e => updateField('anthropicApiKey', e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showAnthropicKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {hasAnthropicKey && (
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => removeKey('anthropic')}
                tooltip={t('remove_key')}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* OpenAI API Key */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="openaiKey">{t('openai_api_key')}</Label>
            {hasOpenaiKey && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" />
                {t('api_key_configured')}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="openaiKey"
                type={showOpenaiKey ? 'text' : 'password'}
                placeholder={hasOpenaiKey ? '••••••••••••••••' : t('api_key_placeholder')}
                value={form.openaiApiKey}
                onChange={e => updateField('openaiApiKey', e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showOpenaiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {hasOpenaiKey && (
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => removeKey('openai')}
                tooltip={t('remove_key')}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
