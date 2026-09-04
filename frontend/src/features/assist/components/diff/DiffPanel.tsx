import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import type { ReactNode } from 'react';

type DiffPanelProps = {
  title: string;
  children: ReactNode;
  onAccept: () => void;
  onReject: () => void;
  /** Header close button. Defaults to `onReject` — pass this to dismiss without discarding. */
  onClose?: () => void;
};

export function DiffPanel({ title, children, onAccept, onReject, onClose }: DiffPanelProps) {
  const t = useTranslations();

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose ?? onReject} className="text-muted-foreground">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">{children}</div>

      <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
        <Button variant="outline" size="sm" onClick={onReject}>
          {t('common.reject')}
        </Button>
        <Button size="sm" onClick={onAccept}>
          <Check className="size-3" />
          {t('common.accept')}
        </Button>
      </div>
    </div>
  );
}
