'use client';

import { ArrowLeft, PanelLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { AssistToggle } from '@/features/assist/components/AssistToggle';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';
import { useOutlineStore } from '@/store/useOutlineStore';

/**
 * The header of a page below `lg`, in the place of `PageHeader`. It reads the same store, so a page sets its
 * title and actions once. Left: the Contents drawer on a page with an outline, else Back. Right: the page
 * actions, the bell and Ask AI.
 */
export function MobileHeader() {
  const t = useTranslations();
  const router = useRouter();
  const title = useBreadcrumbStore(s => s.title);
  const crumbs = useBreadcrumbStore(s => s.crumbs);
  const back = useBreadcrumbStore(s => s.back);
  const actions = useBreadcrumbStore(s => s.actions);
  const subtitle = useBreadcrumbStore(s => s.subtitle);
  const hasOutline = useOutlineStore(s => s.activeKey !== null);
  const isDrawerOpen = useOutlineStore(s => s.isDrawerOpen);
  const setDrawerOpen = useOutlineStore(s => s.setDrawerOpen);
  const kicker = subtitle ?? crumbs.at(-1)?.label;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline px-2">
      {hasOutline ? (
        <Button
          variant="ghost"
          size="icon-lg"
          icon={PanelLeft}
          aria-label={t('outline.contents')}
          aria-haspopup="dialog"
          aria-expanded={isDrawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="size-11 text-muted-foreground [&_svg]:size-5"
        />
      ) : (
        back && (
          <Button
            variant="ghost"
            size="icon-lg"
            icon={ArrowLeft}
            aria-label={t('common.back')}
            onClick={() => router.push(back)}
            className="size-11 text-muted-foreground [&_svg]:size-5"
          />
        )
      )}
      <div className="min-w-0 flex-1 px-1">
        {kicker && <p className="truncate text-xs leading-4 text-muted-foreground">{kicker}</p>}
        <h1 className="truncate font-serif text-lg leading-tight font-medium text-foreground">
          {title || t('app.title')}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <NotificationBell
          align="end"
          className="size-9 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5"
        />
        <AssistToggle />
      </div>
    </header>
  );
}
