'use client';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AiProvider, type ClassroomSettingsRead, KeyPriority, KeyScope } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { cn } from '@/lib/utils';

import { useClassroomSettings, useUpdateClassroomSettings } from '../hooks/useClassrooms';
import {
  buildSettingsUpdate,
  type ClassKeyForm,
  classKeyFormKey,
  formFromSettings,
  hasChanges,
  parseTokenCap,
  providerChangeNeedsKey,
} from '../lib/classKey';

const PROVIDERS = [
  { value: AiProvider.ANTHROPIC, labelKey: 'settings.anthropic', modelKey: 'settings.model_claude_haiku' },
  { value: AiProvider.OPENAI, labelKey: 'settings.openai', modelKey: 'settings.model_gpt4o_mini' },
] as const;

const PRIORITY_OPTIONS: { value: KeyPriority; label: string }[] = [
  { value: KeyPriority.STUDENT, label: 'classrooms.key_priority_student' },
  { value: KeyPriority.CLASS, label: 'classrooms.key_priority_class' },
];

const SCOPE_OPTIONS: { value: KeyScope; label: string }[] = [
  { value: KeyScope.CLASSROOM_CONTENT, label: 'classrooms.key_scope_content' },
  { value: KeyScope.ALL, label: 'classrooms.key_scope_all' },
];

type SectionProps = {
  classroomId: string;
  /** An archived classroom: the fields are read-only. Only "Remove key" stays, as the backend allows it. */
  readOnly: boolean;
};

/** Owner only: the shared Class key, who pays first, where it may be used and the monthly cap per student. */
export function ClassKeySection({ classroomId, readOnly }: SectionProps) {
  const t = useTranslations();
  const { data: settings, isLoading, isError } = useClassroomSettings(classroomId);

  return (
    <SettingsSection title={t('classrooms.class_key_title')} description={t('classrooms.class_key_hint')}>
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('classrooms.failed_to_load_settings')}>
        {/* The key resets the form after a save of these fields. A feed permission save must not reset it. */}
        {settings && (
          <ClassKeyFields
            key={classKeyFormKey(settings)}
            classroomId={classroomId}
            settings={settings}
            readOnly={readOnly}
          />
        )}
      </QueryState>
    </SettingsSection>
  );
}

function ClassKeyFields({ classroomId, settings, readOnly }: SectionProps & { settings: ClassroomSettingsRead }) {
  const t = useTranslations();
  const { mutate: updateSettings, isPending: isSaving } = useUpdateClassroomSettings(classroomId);
  const [form, setForm] = useState<ClassKeyForm>(() => formFromSettings(settings));
  const [showKey, setShowKey] = useState(false);

  const setField = <K extends keyof ClassKeyForm>(field: K, value: ClassKeyForm[K]): void =>
    setForm(current => ({ ...current, [field]: value }));

  const update = buildSettingsUpdate(form, settings);
  const capInvalid = !parseTokenCap(form.capInput).ok;
  // The saved key belongs to the old provider: the server refuses the change without a new key.
  const needsKey = providerChangeNeedsKey(form, settings);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t('settings.ai_provider')}</Label>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map(({ value, labelKey, modelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => setField('aiProvider', value)}
              disabled={readOnly}
              aria-pressed={form.aiProvider === value}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-lg border px-4 py-2.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="class-key">{t('classrooms.class_key_label')}</Label>
          {settings.hasClassKey && (
            <span className="flex items-center gap-1 text-xs text-feedback-correct">
              <Check className="size-3" aria-hidden />
              {t('classrooms.class_key_saved')}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="class-key"
              type={showKey ? 'text' : 'password'}
              placeholder={
                settings.hasClassKey ? t('classrooms.class_key_replace_placeholder') : t('settings.api_key_placeholder')
              }
              value={form.keyInput}
              onChange={e => setField('keyInput', e.target.value)}
              autoComplete="off"
              disabled={readOnly}
              aria-invalid={needsKey}
              className={form.keyInput ? 'pr-10' : undefined}
            />
            {form.keyInput && (
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showKey ? t('settings.hide_key') : t('settings.show_key')}
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            )}
          </div>
          {settings.hasClassKey && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" size="sm" disabled={isSaving}>
                  {t('classrooms.class_key_remove')}
                </Button>
              }
              title={t('classrooms.class_key_remove_title')}
              description={t('classrooms.class_key_remove_description')}
              confirmLabel={t('classrooms.class_key_remove')}
              confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onConfirm={() => updateSettings({ classKey: '' })}
            />
          )}
        </div>
        {needsKey ? (
          <p className="text-xs text-destructive">{t('classrooms.class_key_provider_needs_key')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('classrooms.class_key_never_shown')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="key-priority">{t('classrooms.key_priority_label')}</Label>
        <NativeSelect
          id="key-priority"
          className="max-w-sm"
          value={form.keyPriority}
          disabled={readOnly}
          onChange={e => setField('keyPriority', Number(e.target.value))}
        >
          {PRIORITY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {t(
            form.keyPriority === KeyPriority.CLASS
              ? 'classrooms.key_priority_class_hint'
              : 'classrooms.key_priority_student_hint'
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="key-scope">{t('classrooms.key_scope_label')}</Label>
        <NativeSelect
          id="key-scope"
          className="max-w-sm"
          value={form.keyScope}
          disabled={readOnly}
          onChange={e => setField('keyScope', Number(e.target.value))}
        >
          {SCOPE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {t(form.keyScope === KeyScope.ALL ? 'classrooms.key_scope_all_hint' : 'classrooms.key_scope_content_hint')}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="token-cap">{t('classrooms.token_cap_label')}</Label>
        <Input
          id="token-cap"
          className="max-w-sm"
          inputMode="numeric"
          placeholder={t('classrooms.token_cap_placeholder')}
          value={form.capInput}
          onChange={e => setField('capInput', e.target.value)}
          disabled={readOnly}
          aria-invalid={capInvalid}
        />
        <p className={cn('text-xs', capInvalid ? 'text-destructive' : 'text-muted-foreground')}>
          {t(capInvalid ? 'classrooms.token_cap_invalid' : 'classrooms.token_cap_hint')}
        </p>
      </div>

      <Button
        type="button"
        loading={isSaving}
        disabled={readOnly || needsKey || !hasChanges(update)}
        onClick={() => update && !needsKey && updateSettings(update)}
      >
        {t('common.save')}
      </Button>
    </div>
  );
}
