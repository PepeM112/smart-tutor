'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { Button } from '@/components/ui/button';

type BodyFormProps = {
  /** Text in the field at the start (the edit forms). */
  initialValue?: string;
  maxLength: number;
  /** Accessible name of the field. */
  label: string;
  placeholder?: string;
  submitLabel: string;
  isSubmitting: boolean;
  /** Gets the trimmed text and a callback to run when the write worked (it clears the field or closes the editor). */
  onSubmit: (body: string, onDone: () => void) => void;
  /** Shows a Cancel button (the edit forms). */
  onCancel?: () => void;
  autoFocus?: boolean;
};

/** One text field with a submit button. The composers and the inline editors use it. The text is trimmed and not empty. */
export function BodyForm({
  initialValue = '',
  maxLength,
  label,
  placeholder,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  autoFocus,
}: BodyFormProps) {
  const t = useTranslations();
  const [value, setValue] = useState(initialValue);
  const body = value.trim();
  const canSubmit = body !== '' && body !== initialValue.trim() && !isSubmitting;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={event => {
        event.preventDefault();
        if (canSubmit) onSubmit(body, () => setValue(''));
      }}
    >
      <AutoTextarea
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        rows={2}
        autoFocus={autoFocus}
        disabled={isSubmitting}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          // Ctrl/Cmd + Enter sends, like most comment boxes. A plain Enter is a new line.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground tabular-nums">
          {value.length} / {maxLength}
        </span>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSubmit} loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
