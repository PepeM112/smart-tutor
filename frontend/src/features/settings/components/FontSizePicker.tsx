'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { useFontSize } from '@/hooks/useFontSize';
import { fontSizes, type FontSizeId } from '@/lib/fontSize';

export function FontSizePicker() {
  const t = useTranslations();
  const labelId = useId();
  const { fontSizeId, setFontSize } = useFontSize();

  // The font size lives in this browser only (cookie and localStorage), so there is nothing to save.
  const items: ButtonGroupItem<FontSizeId>[] = fontSizes.map(({ id, label }) => ({ value: id, label }));

  return (
    <div className="space-y-3">
      <div>
        <h3 id={labelId} className="text-sm font-semibold text-foreground">
          {t('settings.font_size_label')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('settings.font_size_description')}</p>
      </div>

      <ButtonGroup aria-labelledby={labelId} value={fontSizeId} items={items} onChange={setFontSize} />
    </div>
  );
}
