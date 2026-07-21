'use client';

import { Dumbbell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';

export default function PracticePage() {
  const t = useTranslations('practice');
  const tCommon = useTranslations('common');
  useBreadcrumb(t('title'));

  return (
    <div className="flex items-center justify-center py-24">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <div className="flex items-center justify-center size-12 rounded-full bg-muted">
            <Dumbbell className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{t('practice_mode')}</p>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <span className="text-[10px] font-medium bg-muted-foreground/20 px-2 py-0.5 rounded-full text-muted-foreground">
            {tCommon('coming_soon')}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
