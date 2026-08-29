'use client';

import { Dumbbell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useBreadcrumb } from '@/hooks/useBreadcrumb';

export default function PracticePage() {
  const t = useTranslations();
  useBreadcrumb(t('practice.title'));

  return (
    <div className="flex items-center justify-center py-24">
      <div className="max-w-sm text-center flex flex-col items-center gap-4 rounded-xl bg-muted/40 p-8">
        <div className="flex items-center justify-center size-12 rounded-full bg-muted">
          <Dumbbell className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{t('practice.practice_mode')}</p>
          <p className="text-sm text-muted-foreground">{t('practice.description')}</p>
        </div>
        <span className="text-[10px] font-medium bg-muted-foreground/20 px-2 py-0.5 rounded-full text-muted-foreground">
          {t('common.coming_soon')}
        </span>
      </div>
    </div>
  );
}
