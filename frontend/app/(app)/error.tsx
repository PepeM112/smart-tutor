'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for all `(app)` pages. It renders inside the app layout,
 * so the sidebar stays. Without it, a render error shows the default Next.js screen.
 */
export default function AppError({ error, reset }: Props) {
  const t = useTranslations();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <p className="text-base font-medium text-foreground">{t('common.error_title')}</p>
      <p className="text-sm text-muted-foreground">{t('common.error_description')}</p>
      <Button variant="outline" onClick={reset}>
        {t('common.try_again')}
      </Button>
    </div>
  );
}
