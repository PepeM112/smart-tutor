'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { isExamRoute, Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useOutlineStore } from '@/store/useOutlineStore';

import { MobileMoreSheet } from './MobileMoreSheet';
import { isNavItemActive, MORE_ITEMS, TAB_ITEMS } from './navItems';

const TAB_CLASS = 'flex h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 outline-none';

/**
 * The nav below `lg`: four destinations and a More sheet with the rest. It sits on the ground, with no border:
 * the page sheet above it marks the edge. It is out of the way on an exam page, where the attempt must not
 * be left by a stray tap.
 */
export function MobileTabBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const setDrawerOpen = useOutlineStore(s => s.setDrawerOpen);

  if (isExamRoute(pathname)) return null;

  const isMoreActive = MORE_ITEMS.some(item => isNavItemActive(item, pathname)) || pathname === Routes.SETTINGS;

  // One drawer at a time: the Contents drawer closes when this sheet opens.
  const openMore = (): void => {
    setDrawerOpen(false);
    setIsMoreOpen(true);
  };

  return (
    <>
      <nav
        aria-label={t('mobile_nav.label')}
        className="relative z-30 flex shrink-0 bg-background px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {TAB_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.labelKey}
              href={item.href ?? '#'}
              aria-current={isActive ? 'page' : undefined}
              className={TAB_CLASS}
            >
              <TabFace isActive={isActive} icon={<Icon size={22} />} label={t(item.shortLabelKey ?? item.labelKey)} />
            </Link>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          onClick={openMore}
          className={TAB_CLASS}
        >
          <TabFace isActive={isMoreActive || isMoreOpen} icon={<Ellipsis size={22} />} label={t('mobile_nav.more')} />
        </button>
      </nav>
      <MobileMoreSheet open={isMoreOpen} onOpenChange={setIsMoreOpen} />
    </>
  );
}

interface TabFaceProps {
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
}

/** The pill holds the icon. The selected tab has a filled pill and a heavier label. */
function TabFace({ isActive, icon, label }: TabFaceProps) {
  return (
    <>
      <span
        className={cn(
          'flex h-7.5 w-14 items-center justify-center rounded-full transition-colors',
          isActive ? 'bg-muted text-primary' : 'text-muted-foreground'
        )}
      >
        {icon}
      </span>
      <span
        className={cn('text-[11px]', isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}
      >
        {label}
      </span>
    </>
  );
}
