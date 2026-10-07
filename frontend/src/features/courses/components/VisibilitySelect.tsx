'use client';

import { useTranslations } from 'next-intl';

import { type SpaceVisibility } from '@/client';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

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
      <Label htmlFor="course-visibility">{t('courses.visibility_label')}</Label>
      <NativeSelect
        id="course-visibility"
        value={value}
        disabled={disabled}
        // SAFETY: the options are the enum values, so the parsed number is always a SpaceVisibility.
        onChange={e => onChange(Number(e.target.value))}
      >
        {VISIBILITY_OPTIONS.map(option => (
          <option key={option} value={option}>
            {t(VISIBILITY_LABELS[option])}
          </option>
        ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{t(VISIBILITY_HINTS[value])}</p>
    </div>
  );
}
