'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  onReload: () => Promise<void>;
  onKeepMine: () => Promise<void>;
};

/** Shown when the server has a newer version of the note than the draft. */
export function ConflictBanner({ onReload, onKeepMine }: Props) {
  const t = useTranslations('notes');
  const [isKeeping, setIsKeeping] = useState(false);

  const handleKeepMine = async () => {
    setIsKeeping(true);
    try {
      await onKeepMine();
    } finally {
      setIsKeeping(false);
    }
  };

  return (
    // flex-wrap: on a phone the buttons go to a second row instead of squeezing the text.
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
      <AlertCircle className="size-4 shrink-0 text-destructive" />
      <span className="min-w-48 flex-1 text-foreground">{t('conflict_banner')}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void onReload()} icon={RefreshCw}>
          {t('reload')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleKeepMine} disabled={isKeeping}>
          {t('keep_mine')}
        </Button>
      </div>
    </div>
  );
}
