'use client';

import { useTranslations } from 'next-intl';

import { type SpaceVisibility } from '@/client';
import { ButtonGroup } from '@/components/ui/button-group';
import { Label } from '@/components/ui/label';

import { VISIBILITY_HINTS, VISIBILITY_LABELS, VISIBILITY_OPTIONS } from '../lib/labels';

type Props = {
  value: SpaceVisibility;
  onChange: (value: SpaceVisibility) => void;
  disabled?: boolean;
};

/** Visibility field with a hint that tells who can find and join the course. */
export function VisibilitySelect({ value, onChange, disabled }: Props) {
  const t = useTranslations();

  return (
    <div className="space-y-2">
      <Label>{t('courses.visibility_label')}</Label>
      <div>
        <ButtonGroup
          value={value}
          onChange={onChange}
          disabled={disabled}
          items={VISIBILITY_OPTIONS.map(option => ({ value: option, label: t(VISIBILITY_LABELS[option]) }))}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t(VISIBILITY_HINTS[value])}</p>
    </div>
  );
}
