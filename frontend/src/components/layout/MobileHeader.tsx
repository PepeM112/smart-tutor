'use client';

import { ArrowLeft, PanelLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store/authStore';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';
import { useOutlineStore } from '@/store/useOutlineStore';

/**
 * The header of a page below `lg`, in the place of `PageHeader`. It reads the same store, so a page sets its
 * title and actions once. Left: Back when the page has one, and the Contents drawer when it has an outline.
 * Right: the page actions, the bell and Profile & Settings. Ask AI is a tab of the bottom bar.
 */
export function MobileHeader() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const title = useBreadcrumbStore(s => s.title);
  const crumbs = useBreadcrumbStore(s => s.crumbs);
  const back = useBreadcrumbStore(s => s.back);
  const actions = useBreadcrumbStore(s => s.actions);
  const subtitle = useBreadcrumbStore(s => s.subtitle);
  const hasOutline = useOutlineStore(s => s.activeKey !== null);
  const isDrawerOpen = useOutlineStore(s => s.isDrawerOpen);
  const setDrawerOpen = useOutlineStore(s => s.setDrawerOpen);
  const kicker = subtitle ?? crumbs.at(-1)?.label;
  const name = user?.displayName || user?.username;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline px-2">
      {back && (
        <Button
          variant="ghost"
          size="icon-lg"
          icon={ArrowLeft}
          aria-label={t('common.back')}
          onClick={() => router.push(back)}
          className="size-9 shrink-0 text-muted-foreground [&_svg]:size-5"
        />
      )}
      {hasOutline && (
        <Button
          variant="ghost"
          size="icon-lg"
          icon={PanelLeft}
          aria-label={t('outline.contents')}
          aria-haspopup="dialog"
          aria-expanded={isDrawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="size-9 shrink-0 text-muted-foreground [&_svg]:size-5"
        />
      )}
      {/* Basis 7.5rem, no shrink: at 360px the title keeps ~120px and the page actions clip instead of it. */}
      <div className="min-w-0 flex-[1_0_7.5rem] px-1">
        {kicker && <p className="truncate text-xs leading-4 text-muted-foreground">{kicker}</p>}
        <h1 className="truncate font-serif text-lg leading-tight font-medium text-foreground">
          {title || t('app.title')}
        </h1>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        {/* No `shrink-0`: a wide action row must not push the page sideways. It takes the free space only: it
            clips, and each child is capped to its width, so no action paints or measures over the bell or Profile. */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden [&>*]:max-w-full">{actions}</div>
        <NotificationBell
          align="end"
          className="size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-5"
        />
        <Link
          href={Routes.SETTINGS}
          aria-label={t('sidebar.profile_and_settings')}
          aria-current={pathname === Routes.SETTINGS ? 'page' : undefined}
          className="flex size-9 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full bg-muted font-serif text-sm text-foreground"
          >
            {name?.charAt(0).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
